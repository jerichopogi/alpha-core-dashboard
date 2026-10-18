/** localStorage key for the colour theme; no value means "follow the device". */
export const THEME_STORAGE_KEY = "theme";

/** Inline script for <head>: applies a saved choice before the first paint, so there is no flash. */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
