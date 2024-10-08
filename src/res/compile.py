import pandas as pd
import re
from functools import reduce

def str_columns(columns):
	return {"names": columns, "dtype": {key: "str" for key in columns}}

df_chars = pd.read_csv("dictionary.csv", header=0, usecols=[0, 1, 2, 3, 4], **str_columns(["char", "canton", "waitau", "hakka", "notes"]))

def normalize_char(char):
	if isinstance(char, str):
		char = char.strip()
		char = re.sub("\\s*(【\\s*)+.*?(】\\s*)+", "", char)
		if char:
			return char
	return pd.NA

def normalize_pron(pron):
	if isinstance(pron, str):
		pron = " ".join(re.findall("[a-zäöüæ]+[1-6]", pron))
		if pron:
			return pron
	return pd.NA

def normalize_notes(row):
	note = row["notes"]
	if isinstance(note, str):
		note = note.strip()
		note = note.replace("~", "～")
		note = note.replace(row["char"], "～")
		note = note.replace("=", "＝")
		note = re.sub("\\s*([,，]\\s*)+", "、", note)
		note = re.sub("\\s*([(（]\\s*)+", "（", note)
		note = re.sub("\\s*([)）]\\s*)+", "）", note)
		if note:
			return note
	return pd.NA

df_chars["char"] = df_chars["char"].apply(normalize_char)
df_chars[["canton", "waitau", "hakka"]] = df_chars[["canton", "waitau", "hakka"]].applymap(normalize_pron)
df_chars["notes"] = df_chars.apply(normalize_notes, axis=1)

ROM_MAPPING = {
	"a": "ä",
	"ää": "a",
	"oe": "ö",
	"eo": "ö",
	"yu": "ü",
	"j": "y",
}

def rom_map(jyutping):
	return re.sub("(g|k)u(?!ng|k)", "\\1wu", reduce(lambda pron, rule: pron.replace(*rule), ROM_MAPPING.items(), jyutping))

df_canto = pd.read_csv("public.csv", header=0, usecols=[0, 1, 8], names=["char", "pron", "freq"], dtype={"char": "str", "pron": "str", "freq": "int64"}, na_filter=False)
df_canto["pron"] = df_canto["pron"].apply(rom_map)
df_charpron = df_chars.set_index(["char", "canton"])
df_canto["order"] = df_canto.index
df_chars["order"] = df_charpron.index.map(df_canto.set_index(["char", "pron"])["order"])
df_chars.drop_duplicates(inplace=True)

df_canto = df_canto.loc[(df_canto["char"].str.len() > 1) & (df_canto["freq"] >= 10), ["char", "pron"]]
df_charpron.sort_index(inplace=True)

def get_collocations(row):
	note = row["notes"]
	if isinstance(note, str):
		note = note.replace("～", row["char"])
		note = re.sub("（.*?）", "", note)
		if note:
			return [collocation for collocation in note.split("、") if row["char"] in collocation]
	return []

df_chars["collocation"] = df_chars.apply(get_collocations, axis=1)
df_collocations = df_chars.explode("collocation")
df_collocations.dropna(subset="collocation", inplace=True)
df_collocations.set_index(["collocation", "char"], inplace=True)
df_collocations.sort_index(inplace=True)
df_chars_lookup = df_chars.set_index("char")
df_chars_lookup.sort_index(inplace=True)

def generate(language):
	global df_chars

	df_words = pd.read_csv(f"{language.capitalize()}Words.csv", header=0, usecols=[5, 7, 8], **str_columns(["char", "pron", "valid"]))
	df_words["char"] = df_words["char"].apply(normalize_char)
	df_words["pron"] = df_words["pron"].apply(normalize_pron)
	df_words = df_words.loc[(df_words["char"].str.len() - df_words["pron"].str.count(" ") == 1) & (df_words["valid"] == "OK"), ["char", "pron"]]

	df_is_monosyllabic_words = df_words["char"].str.len() == 1
	df_monosyllabic_words = df_words[df_is_monosyllabic_words]
	df_chars_native_prons = df_chars.set_index(["char", language])
	other_chars = []

	for row in df_monosyllabic_words.itertuples(index=False):
		charpron = (row.char, row.pron)
		try:
			df_chars_native_prons.loc[charpron]
		except KeyError:
			if charpron not in other_chars:
				other_chars.append(charpron)

	char_col, pron_col = zip(*other_chars)
	df_chars = pd.concat([df_chars, pd.DataFrame({"char": char_col, language: pron_col})])

	other_words = []

	def get_prons(df, index):
		try:
			pron = df.loc[index, language]
		except KeyError:
			return []
		if isinstance(pron, str):
			return [pron]
		elif isinstance(pron, pd.Series):
			return [value for value in pron.unique() if not pd.isna(value)]
		else:
			return []

	def append_prons(df, index):
		roms = get_prons(df, index)
		if len(roms) == 1:
			prons.append(roms[0].strip())
			return True
		return False

	for collocation, df_collocation_chars in df_collocations.groupby(level=0):
		if any(len(get_prons(df_chars_lookup, char)) > 1 for char in collocation):
			prons = []
			if all(append_prons(df_collocation_chars, (collocation, char))
					or append_prons(df_chars_lookup, char) for char in collocation) \
					and len(prons) == len(collocation):
				other_words.append((collocation, " ".join(prons)))

	for row in df_canto.itertuples(index=False):
		chars = row.char
		roms = row.pron.split()
		if any(len(get_prons(df_chars_lookup, char)) > 1 for char in chars):
			prons = []
			if all(append_prons(df_charpron, charpron) for charpron in zip(chars, roms)) \
					and len(prons) == len(chars):
				other_words.append((chars, " ".join(prons)))

	char_col, pron_col = zip(*other_words)
	df_words = pd.concat([df_words[~df_is_monosyllabic_words], pd.DataFrame({"char": char_col, "pron": pron_col})])
	df_words.drop_duplicates(inplace=True)
	df_words.to_csv(f"{language}_words.csv", index=False)

generate("waitau")
generate("hakka")

df_chars.sort_values(["char", "order", "canton"], kind="stable", inplace=True)
df_chars[["char", "waitau", "hakka", "notes"]].to_csv("chars.csv", index=False)
