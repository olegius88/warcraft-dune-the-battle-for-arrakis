// The campaign screen background: Emperor's main menu scene (UI0001 FRONTEND/MAIN.XBF, screen
// MAINMENU.TXT) as a WC3 glue model with a camera (src/emperor/menu-scene.ts).

/** Archive of the frontend scenes and the scene file. */
export const MENU_SCENE = { archive: 'UI0001', file: 'FRONTEND/MAIN.XBF' } as const;
/** Top-level nodes left out: the menu buttons and their labels (MAINMENU.TXT meshes). */
export const MENU_SKIP_ROOT = (name: string): boolean => /popup/i.test(name);
const MENU_TEXTURE_DIR = 'Emperor\\Menu\\Textures\\';
/** Archive paths inside the campaign (the w3f takes the .mdl name; the game loads the .mdx). */
export const MENU_MODEL = {
  model: 'Emperor\\Menu\\MainMenu.mdx',
  field: 'Emperor\\Menu\\MainMenu.mdl',
  /** its textures, apart from the units'; each flag character keeps its own spelling (@nebulas_256
   * and %nebulas_256 are two textures: both became _nebulas_256 and one hid the other) */
  texture: (file: string): string => MENU_TEXTURE_DIR + file.replace(/\.tga$/i, '').replace(/[^A-Za-z0-9_]/g, (c) => `x${c.charCodeAt(0).toString(16)}_`) + '.blp',
} as const;
/** Camera: Emperor lays the menu out for an 800x600 screen seen from the origin along +Z: its title
 * reaches y / z = 0.614 and the legal lines y / z = -0.592 and x / z = -0.770 (MAIN.XBF), so the screen
 * shows tan 0.6 to 0.62 up and 0.8 across. The campaign screen of 1.31.1 showed a vertical angle of
 * 0.595 times the camera's angle (planet size on captures 2026-10-08: asked 61.9 / 77.3 / 91.7 deg,
 * shown 37.0 / 45.9 / 54.6 deg), hence the angle asked for. */
export const MENU_VIEW_TAN = 0.62;
export const MENU_FOV_SHOWN = 0.595;
export const MENU_CAMERA = { fieldOfView: (2 * Math.atan(MENU_VIEW_TAN)) / MENU_FOV_SHOWN, lookAt: 1000, near: 8, far: 40000 } as const;
/** The scene is drawn unshaded and unfogged, like a lit backdrop: with shading and no light, or with
 * the campaign screen's fog, the planet was black (captures 2026-10-08). */
export const MENU_UNSHADED = true;
/** Length of the Stand sequence (ms); every animated node loops on its own global sequence. */
export const MENU_STAND_MS = 60000;
/** Face flag of the glowing parts: every nebula, ring, glow and symbol of the scene has it, the planet,
 * its clouds and the title do not. They are drawn additively (dark = see-through): blended by their
 * alpha the dark nebulas in front of the planet hid it (capture 2026-10-08). */
export const MENU_GLOW_FACE_FLAG = 0x1000;
