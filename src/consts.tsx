import { MdCancel, MdEject, MdFileDownload, MdFileDownloadDone, MdHourglassBottom, MdMan, MdRefresh, MdWoman } from "react-icons/md";

import type { ActualDownloadStatus, InferenceMode, Language, ModelComponent, DownloadStatus, Terminology, Voice, OfflineInferenceMode, AudioComponent } from "./types";

export const TERMINOLOGY: Record<Terminology, string> = {
	waitau: "圍頭話",
	hakka: "客家話",
	male: "男聲",
	female: "女聲",
};

export const VOICE_TO_ICON: Record<Voice, JSX.Element> = {
	male: <MdMan size="1.375em" className="-mx-1" />,
	female: <MdWoman size="1.375em" className="-mx-1" />,
};

export const ALL_LANGUAGES: readonly Language[] = ["waitau", "hakka"];
export const ALL_VOICES: readonly Voice[] = ["male", "female"];
export const ALL_INFERENCE_MODES: readonly InferenceMode[] = ["online", "offline", "plain"];
export { ALL_MODEL_COMPONENTS } from "./inference/infer";
export const ALL_AUDIO_COMPONENTS: readonly AudioComponent[] = ["chars", "words"];

export const MODEL_COMPONENT_TO_N_CHUNKS: Record<ModelComponent, number> = {
	enc: 2,
	emb: 1,
	sdp: 1,
	flow: 7,
	dec: 3,
};

export const MODEL_PATH_PREFIX = "https://cdn.jsdelivr.net/gh/hkilang/TTS-models";

export const DOWNLOAD_TYPE_LABEL: Record<OfflineInferenceMode, string> = {
	offline: "模型",
	plain: "數據",
};

export const DOWNLOAD_STATUS_LABEL: Record<DownloadStatus, string> = {
	gathering_info: "正在取得＿＿狀態……",
	gather_failed: "無法取得＿＿狀態：資料庫出錯",
	available_for_download: "可供下載",
	new_version_available: "有新版本可供下載",
	incomplete: "＿＿不完整",
	downloading: "下載中……",
	download_failed: "下載失敗：網絡錯誤",
	download_incomplete: "下載不完整：網絡錯誤",
	cancelled_not_downloaded: "下載已被取消；＿＿尚未下載",
	cancelled_incomplete: "下載已被取消；＿＿不完整",
	save_failed: "下載失敗：儲存至資料庫時發生錯誤",
	save_incomplete: "下載不完整：儲存至資料庫時發生錯誤",
	latest: "已經為最新版本",
};

export const DOWNLOAD_STATUS_CLASS: Record<DownloadStatus, string> = {
	gathering_info: "text-info",
	gather_failed: "text-error",
	available_for_download: "text-info",
	new_version_available: "text-info",
	incomplete: "text-error",
	downloading: "text-info",
	download_failed: "text-error",
	download_incomplete: "text-error",
	cancelled_not_downloaded: "text-error",
	cancelled_incomplete: "text-error",
	save_failed: "text-error",
	save_incomplete: "text-error",
	latest: "text-success",
};

export const DOWNLOAD_STATUS_ICON: Record<DownloadStatus, JSX.Element> = {
	gathering_info: <MdHourglassBottom />,
	gather_failed: <MdRefresh />,
	available_for_download: <MdFileDownload />,
	new_version_available: <MdFileDownload />,
	incomplete: <MdEject className="rotate-90" />,
	downloading: <MdCancel />,
	download_failed: <MdRefresh />,
	download_incomplete: <MdRefresh />,
	cancelled_not_downloaded: <MdFileDownload />,
	cancelled_incomplete: <MdEject className="rotate-90" />,
	save_failed: <MdRefresh />,
	save_incomplete: <MdRefresh />,
	latest: <MdFileDownloadDone />,
};

export const DOWNLOAD_STATUS_ACTION_LABEL: Record<DownloadStatus, string | null> = {
	gathering_info: null,
	gather_failed: "重試",
	available_for_download: "下載",
	new_version_available: "下載",
	incomplete: "繼續下載",
	downloading: "取消下載",
	download_failed: "重試",
	download_incomplete: "重試",
	cancelled_not_downloaded: "下載",
	cancelled_incomplete: "繼續下載",
	save_failed: "重試",
	save_incomplete: "重試",
	latest: null,
};

export const DOWNLOAD_STATUS_PRIORITY: readonly ActualDownloadStatus[] = ["incomplete", "available_for_download", "new_version_available", "latest"];

export const DOWNLOAD_STATUS_INDICATOR_CLASS: Record<Exclude<ActualDownloadStatus, "latest">, string> = {
	available_for_download: "text-info",
	new_version_available: "text-warning",
	incomplete: "text-error",
};

export const AUDIO_PATH_PREFIX = "https://cdn.jsdelivr.net/gh/hkilang/TTS-audios";

export const NO_AUTO_FILL = {
	autoComplete: "off",
	autoCorrect: "off",
	autoCapitalize: "off",
	spellCheck: "false",
} as const;

export class DatabaseError extends Error {
	override name = "DatabaseError";
}

export class FileNotDownloadedError extends Error {
	override name = "FileNotDownloadedError";
	constructor(inferenceMode: OfflineInferenceMode, language: Language, voice: Voice, isComplete?: boolean, options?: ErrorOptions) {
		super(`${TERMINOLOGY[language]}（${TERMINOLOGY[voice]}）${DOWNLOAD_TYPE_LABEL[inferenceMode]}尚未下載${isComplete ? "" : "完成"}`, options);
	}
}
