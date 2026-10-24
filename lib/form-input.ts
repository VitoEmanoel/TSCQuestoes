export function withoutNullCharacters(value: string): string {
  return value.replaceAll("\u0000", "");
}

export function formValue(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? withoutNullCharacters(value) : null;
}

export function formText(formData: FormData, name: string): string {
  return formValue(formData, name) ?? "";
}

export function formValues(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === "string" ? [withoutNullCharacters(value)] : []));
}

export function queryValues(value: string | string[] | undefined): string[] {
  const list = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return list.map(withoutNullCharacters);
}
