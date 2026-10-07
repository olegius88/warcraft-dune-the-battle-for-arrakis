// Movie slide-show probe: does the 1.31.1 client show imported JPEG BLP textures on a UI backdrop
// over the whole screen, switch them in time with the MP3, and restore the interface afterwards?
// The slide show of {{frames}} frames at {{fps}} per second ({{size}} 4-plane JPEG BLP, src/emperor/fmv.ts).
// 2026-10-07: 256x256 4-plane frames shown right (a YCbCr JPEG is not: src/smoke/build-blp-probe.ts).
function FmvProbeLog takes string s returns nothing
    set udg_log = udg_log + s + " @" + R2S(TimerGetElapsed(udg_clock)) + "; "
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(udg_log)
    call PreloadGenEnd({{str report}})
endfunction

function FmvProbeTick takes nothing returns nothing
    set udg_frame = udg_frame + 1
    if udg_frame >= {{frames}} then
        call PauseTimer(GetExpiredTimer())
        call BlzFrameSetVisible(udg_movie, false)
        call BlzFrameSetVisible(udg_black, false)
        call BlzHideOriginFrames(false)
        call FmvProbeLog("end")
        return
    endif
    call BlzFrameSetTexture(udg_movie, {{str framePrefix}} + SubString(I2S(10000 + udg_frame), 1, 5) + ".blp", 0, true)
endfunction

function FmvProbeSlides takes nothing returns nothing
    local sound s = CreateSound({{str sound}}, false, false, false, 10, 10, "")
    call SetSoundVolume(s, 127)
    call StartSound(s)
    call KillSoundWhenDone(s)
    set udg_frame = 0
    call BlzFrameSetTexture(udg_movie, {{str framePrefix}} + "0000.blp", 0, true)
    call FmvProbeLog("slides")
    call TimerStart(CreateTimer(), {{real period}}, true, function FmvProbeTick)
endfunction

function FmvProbeRun takes nothing returns nothing
    local framehandle ui = BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0)
    call BlzHideOriginFrames(true)
    set udg_black = BlzCreateFrameByType("BACKDROP", "EmpMovieBlack", ui, "", 0)
    call BlzFrameSetAbsPoint(udg_black, FRAMEPOINT_TOPLEFT, {{real black.left}}, {{real black.top}})
    call BlzFrameSetAbsPoint(udg_black, FRAMEPOINT_BOTTOMRIGHT, {{real black.right}}, {{real black.bottom}})
    call BlzFrameSetTexture(udg_black, {{str blackTexture}}, 0, true)
    set udg_movie = BlzCreateFrameByType("BACKDROP", "EmpMovie", ui, "", 0)
    call BlzFrameSetAbsPoint(udg_movie, FRAMEPOINT_TOPLEFT, {{real area.left}}, {{real area.top}})
    call BlzFrameSetAbsPoint(udg_movie, FRAMEPOINT_BOTTOMRIGHT, {{real area.right}}, {{real area.bottom}})
    call FmvProbeSlides()
endfunction
