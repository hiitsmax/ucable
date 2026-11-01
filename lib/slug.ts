// "uCable Dev & AI" -> "dev-ai": file name of the channel logo in public/channels/
export const slug = (name: string) =>
  name
    .replace(/^ucable\s+/i, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // "Attualità" -> "attualita"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export const logoUrl = (name: string) => `/channels/${slug(name)}.png`;
