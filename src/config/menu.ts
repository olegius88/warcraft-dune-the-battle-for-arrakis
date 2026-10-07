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
  /** its textures, apart from the units' (flag characters become _) */
  texture: (file: string): string => MENU_TEXTURE_DIR + file.replace(/\.tga$/i, '').replace(/[^A-Za-z0-9_]/g, '_') + '.blp',
} as const;
/** Camera: Emperor lays the menu out for an 800x600 screen seen from the origin along +Z, one unit
 * a pixel at z = 500 (the legal lines sit at x = -396 / y = -272 and -284 at z = 547, just inside the
 * corner): vertical field of view 2 atan(300 / 500). Which axis WC3's camera angle is (vertical
 * assumed) is checked on a capture of the campaign screen. */
export const MENU_CAMERA = { fieldOfView: 2 * Math.atan(300 / 500), lookAt: 1000, near: 8, far: 40000 } as const;
/** Length of the Stand sequence (ms); every animated node loops on its own global sequence. */
export const MENU_STAND_MS = 60000;
/** Layer filter of a scene texture by its flag character (assumed from the textures: "!" ones are
 * dark without alpha, so additive; "%" ones dark with alpha, additive with alpha; "@" and the rest
 * with alpha blend over the scene). */
export const MENU_TEXTURE_FLAG_FILTER = { '!': 'additive', '%': 'addAlpha', '@': 'blend' } as const;
