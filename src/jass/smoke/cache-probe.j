// Texture cache probe (src/smoke/build-cache-probe.ts). 2026-10-08: a 15 fps 640x480 slide show grew the
// game's private memory by ~25 MB/s, as if every frame texture stayed cached. Phases of {{phase}} s,
// the runner samples memory: A frames 0..n plainly, B the same frames again (cached by path?),
// C the next frames with the backdrop destroyed and made anew every second (released with it?),
// D the next frames on one backdrop after BlzFrameSetTexture to an empty path between frames.
function CacheProbeLog takes string s returns nothing
    set udg_log = udg_log + s + " @" + I2S(R2I(TimerGetElapsed(udg_clock))) + ";"
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(udg_log)
    call PreloadGenEnd({{str report}})
endfunction

function CacheProbeNew takes nothing returns nothing
    if udg_movie != null then
        call BlzDestroyFrame(udg_movie)
    endif
    set udg_movie = BlzCreateFrameByType("BACKDROP", "EmpCacheProbe", BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0), "", 0)
    call BlzFrameSetAbsPoint(udg_movie, FRAMEPOINT_TOPLEFT, 0.0, 0.6)
    call BlzFrameSetAbsPoint(udg_movie, FRAMEPOINT_BOTTOMRIGHT, 0.8, 0.0)
endfunction

function CacheProbeTick takes nothing returns nothing
    local integer f
    set udg_tick = udg_tick + 1
    if udg_tick == {{n}} then
        call CacheProbeLog("B")
    elseif udg_tick == 2 * {{n}} then
        call CacheProbeLog("C")
    elseif udg_tick == 3 * {{n}} then
        call CacheProbeLog("D")
    elseif udg_tick == 4 * {{n}} then
        call CacheProbeLog("end")
        call PauseTimer(GetExpiredTimer())
        return
    endif
    if udg_tick < {{n}} then
        set f = udg_tick
    elseif udg_tick < 2 * {{n}} then
        set f = udg_tick - {{n}}
    else
        set f = udg_tick - {{n}}
        if udg_tick < 3 * {{n}} and ModuloInteger(udg_tick, {{fps}}) == 0 then
            call CacheProbeNew()
        elseif udg_tick >= 3 * {{n}} then
            call BlzFrameSetTexture(udg_movie, "", 0, true)
        endif
    endif
    call BlzFrameSetTexture(udg_movie, {{str framePrefix}} + SubString(I2S(10000 + f), 1, 5) + ".blp", 0, true)
endfunction

function CacheProbeRun takes nothing returns nothing
    call BlzHideOriginFrames(true)
    call CacheProbeNew()
    call CacheProbeLog("A")
    call TimerStart(CreateTimer(), {{real period}}, true, function CacheProbeTick)
endfunction
