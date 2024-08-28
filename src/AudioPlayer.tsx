import { useCallback, useEffect, useReducer, useRef, useState } from "react";

import { MdErrorOutline, MdFileDownload, MdPause, MdPlayArrow, MdRefresh, MdStop } from "react-icons/md";

import { getOffsetMap } from "./audio";
import { cachedFetch } from "./cache";
import { ALL_AUDIO_COMPONENTS, ALL_MODEL_COMPONENTS, DatabaseError, DOWNLOAD_TYPE_LABEL, FileNotDownloadedError, NO_AUTO_FILL, ServerError } from "./consts";
import { useDB } from "./db/DBContext";
import { CURRENT_AUDIO_VERSION, CURRENT_MODEL_VERSION } from "./db/version";
import API from "./inference/api";

import type { Language, DownloadComponentToFile, SettingsDialogState, SetDownloadStatus, DownloadVersion, Voice, ModelComponentToFile, AudioComponentToFile, OfflineInferenceMode, AudioVersion, QueryOptionsState } from "./types";
import type { SyntheticEvent } from "react";

const context = new AudioContext({ sampleRate: 44100 });
const audioCache = new Map<string, Map<string, AudioBuffer>>();

interface AudioPlayerProps extends QueryOptionsState, SetDownloadStatus, SettingsDialogState {
	language: Language;
	voice: Voice;
	syllables: string[];
}

export default function AudioPlayer({
	queryOptions: {
		inferenceMode,
		voiceSpeed,
	},
	language,
	voice,
	syllables,
	setDownloadState,
	currSettingsDialogPage,
	setCurrSettingsDialogPage,
}: AudioPlayerProps) {
	useEffect(() => void context.resume(), []);
	const [buffer, setBuffer] = useState<AudioBuffer | undefined>();
	const [sourceNode, setSourceNode] = useState<AudioBufferSourceNode | undefined>();
	const [isPlaying, setIsPlaying] = useState<boolean | null>(false);
	const [startTime, setStartTime] = useState(0);
	const [progress, setProgress] = useState(0);
	const animationId = useRef(0);

	const playAudio = useCallback(() => {
		if (isPlaying || !buffer) return;
		const sourceNode = context.createBufferSource();
		sourceNode.buffer = buffer;
		const _progress = progress * buffer.duration;
		sourceNode.connect(context.destination);
		sourceNode.start(0, _progress);
		setSourceNode(sourceNode);
		setIsPlaying(true);
		setStartTime(context.currentTime - _progress);
	}, [buffer, isPlaying, progress]);

	const pauseAudio = useCallback(() => {
		setIsPlaying(false);
		if (!sourceNode) return;
		sourceNode.stop();
		sourceNode.disconnect();
		setSourceNode(undefined);
	}, [sourceNode]);

	const stopAudio = useCallback(() => {
		pauseAudio();
		setProgress(0);
		setStartTime(context.currentTime);
	}, [pauseAudio]);

	useEffect(() => {
		context.addEventListener("statechange", pauseAudio);
		return () => context.removeEventListener("statechange", pauseAudio);
	}, [pauseAudio]);

	const { db, error: dbInitError, retry: dbInitRetry } = useDB();
	const [downloadError, setDownloadError] = useState<Error>();
	const [downloadRetryCounter, downloadRetry] = useReducer((n: number) => n + 1, 0);
	const [download, setDownload] = useState<DownloadComponentToFile>();

	const store = inferenceMode === "offline" ? "models" : "audios";
	const CURRENT_VERSION = inferenceMode === "offline" ? CURRENT_MODEL_VERSION : CURRENT_AUDIO_VERSION;
	const ALL_COMPONENTS = inferenceMode === "offline" ? ALL_MODEL_COMPONENTS : ALL_AUDIO_COMPONENTS;

	useEffect(() => {
		async function getDownloadComponents() {
			if (inferenceMode === "online" || !db || download || currSettingsDialogPage) return;
			setDownloadError(undefined);
			setBuffer(undefined);
			try {
				const availableFiles = await db.getAllFromIndex(store, "language_voice", [language, voice]);
				if (availableFiles.length !== ALL_COMPONENTS.length) {
					setDownloadError(new FileNotDownloadedError(inferenceMode, language, voice, !availableFiles.length));
					setDownloadState({ inferenceMode, language, voice, status: availableFiles.length ? "incomplete" : "available_for_download" });
					return;
				}
				const components = {} as DownloadComponentToFile;
				const versions = new Set<DownloadVersion>();
				for (const file of availableFiles) {
					components[file.component] = file;
					versions.add(file.version);
				}
				if (versions.size !== 1) {
					setDownloadError(new FileNotDownloadedError(inferenceMode, language, voice));
					setDownloadState({ inferenceMode, language, voice, status: "incomplete" });
					return;
				}
				setDownload(components);
				setDownloadState({ inferenceMode, language, voice, status: versions.values().next().value === CURRENT_VERSION ? "latest" : "new_version_available" });
			}
			catch (error) {
				setDownloadError(new DatabaseError(`無法存取語音${DOWNLOAD_TYPE_LABEL[inferenceMode]}：資料庫出錯`, { cause: error }));
			}
		}
		void getDownloadComponents();
		// `inferenceMode` and `voiceSpeed` intentionally excluded
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [db, download, language, voice, setDownloadState, currSettingsDialogPage, downloadRetryCounter]);

	const [generationError, setGenerationError] = useState<Error>();
	const [generationRetryCounter, generationRetry] = useReducer((n: number) => n + 1, 0);
	const text = syllables.join(" ");
	useEffect(() => {
		if (inferenceMode !== "online" && !download) return;
		const [{ version }] = inferenceMode === "online" ? [{ version: "main" }] : Object.values(download!);
		async function generateAudio() {
			const key = `${inferenceMode}/${voiceSpeed}/${version}/${language}/${voice}`;
			let textToBuffer = audioCache.get(key);
			if (!textToBuffer) audioCache.set(key, textToBuffer = new Map<string, AudioBuffer>());
			let buffer = textToBuffer.get(text);
			if (!buffer) {
				try {
					switch (inferenceMode) {
						case "online":
							try {
								const response = await cachedFetch(`https://Chaak2.pythonanywhere.com/TTS/${language}/${encodeURI(text)}?voice=${voice}&speed=${voiceSpeed}`);
								if (response.ok) {
									buffer = await context.decodeAudioData(await response.arrayBuffer());
								}
								else {
									const { error, message } = await response.json() as { error: string; message?: string };
									throw new ServerError(error, message);
								}
							}
							catch (error) {
								throw error instanceof ServerError ? error : new ServerError("載入失敗", undefined, { cause: error });
							}
							break;
						case "offline": {
							const channelData = await API.infer(language, download as ModelComponentToFile, syllables, voiceSpeed);
							buffer = context.createBuffer(1, channelData.length, 44100);
							buffer.copyToChannel(channelData, 0);
							break;
						}
						case "lightweight": {
							const buffers = await Promise.all(syllables.map(async phrase => {
								const component = phrase.includes(" ") ? "words" : "chars";
								const offset = (await getOffsetMap(version as AudioVersion, language, voice, component)).get(phrase);
								if (!offset) return context.createBuffer(1, 8820, 44100);
								const data = (download as AudioComponentToFile)[component].file;
								return context.decodeAudioData(data.slice(...offset));
							}));
							buffer = context.createBuffer(1, buffers.reduce((length, buffer) => length + buffer.length, 0), 44100);
							const channelData = buffer.getChannelData(0);
							let outputOffset = 0;
							for (const buffer of buffers) {
								channelData.set(buffer.getChannelData(0), outputOffset);
								outputOffset += buffer.length;
							}
							break;
						}
					}
					textToBuffer.set(text, buffer);
				}
				catch (error) {
					setGenerationError(error as Error);
				}
			}
			setBuffer(buffer);
		}
		pauseAudio();
		if (isPlaying) setIsPlaying(null);
		setGenerationError(undefined);
		setBuffer(undefined);
		void generateAudio();
		// `inferenceMode` and `voiceSpeed` intentionally excluded
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [language, voice, download, text, generationRetryCounter]);

	useEffect(() => {
		if (buffer && isPlaying === null) playAudio();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [buffer]);

	useEffect(() => {
		if (!isPlaying || !buffer) return;
		function updateSeekBar() {
			if (isPlaying && buffer) {
				const _progress = (context.currentTime - startTime) / buffer.duration;
				setProgress(_progress);
				if (_progress >= 1) stopAudio();
			}
			animationId.current = requestAnimationFrame(updateSeekBar);
		}
		updateSeekBar();
		return () => cancelAnimationFrame(animationId.current);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isPlaying, buffer, stopAudio]);

	const seekBarDown = useCallback(() => {
		if (!isPlaying) return;
		pauseAudio();
		setIsPlaying(null);
	}, [isPlaying, pauseAudio]);

	const seekBarMove = useCallback((event: SyntheticEvent<HTMLInputElement>) => {
		const _progress = +event.currentTarget.value;
		setProgress(_progress);
		if (buffer) setStartTime(context.currentTime - _progress * buffer.duration);
	}, [buffer]);

	const seekBarUp = useCallback(() => {
		if (isPlaying === null) playAudio();
	}, [isPlaying, playAudio]);

	const error = dbInitError || downloadError || generationError;
	useEffect(() => {
		if (error) console.error(error);
	}, [error]);

	return <div className="flex items-center mt-2 relative">
		<button
			type="button"
			className="btn btn-warning btn-square text-3xl max-sm:size-10 max-sm:min-h-10"
			onClick={isPlaying === false ? playAudio : pauseAudio}
			aria-label={isPlaying === false ? "播放" : "暫停"}
			tabIndex={buffer ? 0 : -1}>
			{isPlaying === false ? <MdPlayArrow /> : <MdPause />}
		</button>
		<input
			type="range"
			className="range range-warning range-sm grow mx-3 sm:mx-4"
			min={0}
			max={1}
			value={progress}
			step="any"
			{...NO_AUTO_FILL}
			onMouseDown={seekBarDown}
			onTouchStart={seekBarDown}
			onChange={seekBarMove}
			onMouseUp={seekBarUp}
			onTouchEnd={seekBarUp}
			onTouchCancel={seekBarUp}
			tabIndex={buffer ? 0 : -1} />
		<button
			type="button"
			className="btn btn-warning btn-square text-3xl max-sm:size-10 max-sm:min-h-10"
			onClick={stopAudio}
			aria-label="停止"
			tabIndex={buffer ? 0 : -1}>
			<MdStop />
		</button>
		{(error || !buffer) && <div className={`absolute inset-0 flex items-center justify-center ${error ? "bg-gray-300 bg-opacity-50 text-error" : "bg-gray-500 bg-opacity-20"} rounded-lg text-xl`}>
			{error
				? <div>
					<MdErrorOutline size="1.1875em" className="inline align-middle mt-0.5 mr-1" />
					<span className="leading-8 align-middle">
						{error instanceof FileNotDownloadedError || error instanceof DatabaseError ? <span className="font-medium">{error.message}</span> : <>
							<span className="font-bold">錯誤：</span>
							{error.name}
							{error.message && <>
								{": "}
								<code>{error.message}</code>
							</>}
						</>}
					</span>
					<button
						type="button"
						className="btn btn-info btn-sm text-lg text-neutral-content ml-2 pl-2 gap-1 align-middle"
						onClick={dbInitError
							? dbInitRetry
							: downloadError
							? (downloadError instanceof FileNotDownloadedError ? () => setCurrSettingsDialogPage(`${inferenceMode as OfflineInferenceMode}_mode_downloads`) : downloadRetry)
							: generationError
							? generationRetry
							: undefined}>
						{error instanceof FileNotDownloadedError
							? <>
								<MdFileDownload size="1.1875em" />下載{DOWNLOAD_TYPE_LABEL[inferenceMode as OfflineInferenceMode]}
							</>
							: <>
								<MdRefresh size="1.1875em" />重試
							</>}
					</button>
				</div>
				: <div className="flex items-center gap-3 font-medium">
					{db ? inferenceMode === "online" || download ? "正在生成語音，請稍候……" : `正在存取語音${DOWNLOAD_TYPE_LABEL[inferenceMode]}……` : "資料庫載入中……"}
					<span className="loading loading-spinner max-sm:w-8 sm:loading-lg" />
				</div>}
		</div>}
	</div>;
}
