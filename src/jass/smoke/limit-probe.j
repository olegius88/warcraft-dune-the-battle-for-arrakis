// Texture limit probe (src/smoke/build-limit-probe.ts): {{count}} distinct textures one after the other
// on a backdrop; the report holds the last texture shown every 250 (one line each, Preload truncates
// long lines) with the game time: where it stops is where the client gave up.
function LimitProbeTick takes nothing returns nothing
    set udg_n = udg_n + 1
    if udg_n >= {{count}} then
        call PauseTimer(GetExpiredTimer())
        set udg_log = "end " + I2S(udg_n) + " @" + R2S(TimerGetElapsed(udg_clock))
    elseif ModuloInteger(udg_n, 250) == 0 then
        set udg_log = I2S(udg_n) + " @" + R2S(TimerGetElapsed(udg_clock))
    endif
    call BlzFrameSetTexture(udg_view, {{str prefix}} + SubString(I2S(100000 + udg_n), 1, 6) + ".blp", 0, true)
    if ModuloInteger(udg_n, 250) == 0 or udg_n >= {{count}} then
        call PreloadGenClear()
        call PreloadGenStart()
        call Preload(udg_log)
        call PreloadGenEnd({{str report}})
    endif
endfunction

function LimitProbeRun takes nothing returns nothing
    set udg_view = BlzCreateFrameByType("BACKDROP", "EmpLimitProbe", BlzGetOriginFrame(ORIGIN_FRAME_GAME_UI, 0), "", 0)
    call BlzFrameSetAbsPoint(udg_view, FRAMEPOINT_TOPLEFT, 0.0, 0.6)
    call BlzFrameSetAbsPoint(udg_view, FRAMEPOINT_BOTTOMRIGHT, 0.8, 0.0)
    call TimerStart(CreateTimer(), {{real period}}, true, function LimitProbeTick)
endfunction
