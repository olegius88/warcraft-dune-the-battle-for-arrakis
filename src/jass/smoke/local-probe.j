// Local files probe (src/smoke/build-local-probe.ts): with "Allow Local Files" = 1, does the 1.31.1
// client read textures and sounds from a folder in its install directory, and does it draw
// non-power-of-two JPEG BLPs? Quarters: top left a texture imported into the map (control), top
// right a 512x512 local one, bottom left a 640x480 local one, bottom right a 1024x512 local one.
// 2026-10-07, 1.31.1: all four drawn right, the local sound read (7079 ms, as the imported one).
function LocalProbeQuad takes integer i, real x, real y, string tex returns nothing
    local framehandle f = BlzCreateFrameByType("BACKDROP", "EmpLocalProbe", BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0), "", i)
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_TOPLEFT, x, y)
    call BlzFrameSetAbsPoint(f, FRAMEPOINT_BOTTOMRIGHT, x + 0.4, y - 0.3)
    call BlzFrameSetTexture(f, tex, 0, true)
endfunction

function LocalProbeRun takes nothing returns nothing
    local sound s = CreateSound({{str localSound}}, false, false, false, 10, 10, "")
    call BlzHideOriginFrames(true)
    call LocalProbeQuad(0, 0.0, 0.6, {{str tex.0}})
    call LocalProbeQuad(1, 0.4, 0.6, {{str tex.1}})
    call LocalProbeQuad(2, 0.0, 0.3, {{str tex.2}})
    call LocalProbeQuad(3, 0.4, 0.3, {{str tex.3}})
    call StartSound(s)
    call KillSoundWhenDone(s)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("mapSound=" + I2S(GetSoundFileDuration({{str mapSound}})) + " localSound=" + I2S(GetSoundFileDuration({{str localSound}})))
    call PreloadGenEnd({{str report}})
endfunction
