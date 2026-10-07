// Icon probe: the hero bar (top left, visible in window captures) shows the icon of a stock hero
// whose object data icon (uico) is a converted Emperor icon; when the hero dies the bar shows the
// disabled (DISBTN) icon. Frames before and after the death show both.
function IconProbeKill takes nothing returns nothing
    call KillUnit(udg_probeHero)
endfunction

function IconProbeRun takes nothing returns nothing
    set udg_probeHero = CreateUnit(Player(0), '{{hero}}', 0.0, 0.0, 270.0)
    call SetCameraPosition(0.0, 0.0)
    call TimerStart(CreateTimer(), {{killAfter}}, false, function IconProbeKill)
endfunction
