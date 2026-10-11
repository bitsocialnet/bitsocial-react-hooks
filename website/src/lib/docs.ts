import { getCollection } from "astro:content";
import packageInfo from "../../../package.json";

export const packageVersion = packageInfo.version;
export const repoUrl = "https://github.com/bitsocialnet/bitsocial-react-hooks";
export const groups = ["Start building", "API reference", "Recipes", "Advanced"];
export async function getDocs() {
  return (await getCollection("docs")).sort((a, b) => a.data.order - b.data.order);
}
