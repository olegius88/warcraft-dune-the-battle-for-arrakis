// Tech probe (src/smoke/build-tech-probe.ts): do custom upgrades (war3map.w3q) work as building
// upgrades in 1.31.1? A barracks researches {{upgrade}}; a custom footman {{unit}} requires it (ureq).
// Reported: train order before the research, research order while SetPlayerTechMaxAllowed is 0,
// research order when allowed, the tech count after the research time, train order afterwards.
function TechProbeLog takes string s returns nothing
    set udg_log[udg_n] = s
    set udg_n = udg_n + 1
    call PreloadGenClear()
    call PreloadGenStart()
    set udg_i = 0
    loop
        exitwhen udg_i >= udg_n
        call Preload(udg_log[udg_i])
        set udg_i = udg_i + 1
    endloop
    call PreloadGenEnd({{str report}})
endfunction

function TechProbeRun takes nothing returns nothing
    local unit b = CreateUnit(Player(0), {{barracks}}, 0.0, 0.0, 270.0)
    local boolean ok
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD, 10000)
    call SetPlayerState(Player(0), PLAYER_STATE_RESOURCE_FOOD_CAP, 50)
    call TriggerSleepAction(0.5)
    set ok = IssueImmediateOrderById(b, {{unit}})
    call TechProbeLog("train before research=" + I2S(IntegerTertiaryOp(ok, 1, 0)))
    call IssueImmediateOrderById(b, 851976)
    call SetPlayerTechMaxAllowed(Player(0), {{upgrade}}, 0)
    set ok = IssueImmediateOrderById(b, {{upgrade}})
    call TechProbeLog("research while max 0=" + I2S(IntegerTertiaryOp(ok, 1, 0)))
    call IssueImmediateOrderById(b, 851976)
    call SetPlayerTechMaxAllowed(Player(0), {{upgrade}}, 1)
    set ok = IssueImmediateOrderById(b, {{upgrade}})
    call TechProbeLog("research allowed=" + I2S(IntegerTertiaryOp(ok, 1, 0)) + " gold after order=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)))
    call TriggerSleepAction({{real wait}})
    call TechProbeLog("tech count=" + I2S(GetPlayerTechCount(Player(0), {{upgrade}}, true)) + " name=" + GetObjectName({{upgrade}}))
    set ok = IssueImmediateOrderById(b, {{unit}})
    call TechProbeLog("train after research=" + I2S(IntegerTertiaryOp(ok, 1, 0)))
    call TechProbeLog("done")
    set b = null
endfunction
