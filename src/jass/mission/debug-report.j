// Debug report for unattended tests: CustomMapData\<DEBUG_REPORT_DIR>\<name>.pld every DEBUG_REPORT_PERIOD s.
function EmpDebugReport takes nothing returns nothing
    local string s = "t=" + I2S(EmpTick) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTechLevel) + " enemy=" + I2S(EmpEnemyHouse) + " camp=" + I2S(EF_B2I(EmpInCampaign))
    local integer i = 0
    local string v
    local unit u
    loop
        exitwhen i > {{RT.DEBUG_REPORT_SIDES}}
        set s = s + " s" + I2S(i) + "=" + I2S(EmpCount(i, 1)) + "u/" + I2S(EmpCount(i, 2)) + "b"
        set i = i + 1
    endloop
    set s = s + " gold=" + I2S(GetPlayerState(Player(0), PLAYER_STATE_RESOURCE_GOLD)) + " aigold=" + I2S(GetPlayerState(Player(1), PLAYER_STATE_RESOURCE_GOLD)) + " aiprod=" + I2S(EmpAiProduced) + " mines=" + I2S(EmpCount({{RT.NEUTRAL_SIDE}}, 0)) + " ended=" + I2S(EF_B2I(EmpEnded)) + " speech=" + I2S(EmpSpeechHead) + "/" + I2S(EmpSpeechTail) + " ms=" + I2S(EmpSpeechLastMs){{#if musicList}} + " music=" + I2S(GetSoundFileDuration({{jFirstTrack}})){{/if}}
    // second line (Preload cuts long lines): the camera and a player unit, to tell where the view is
    set EmpTmpUnit = null
    set EmpTmpType = 1
    call GroupEnumUnitsOfPlayer(EmpTmpGroup, Player(0), Filter(function EmpFirstEnum))
    set u = EmpTmpUnit
    set v = "cam=" + I2S(R2I(GetCameraTargetPositionX())) + "," + I2S(R2I(GetCameraTargetPositionY()))
    if u != null then
        set v = v + " unit=" + I2S(R2I(GetUnitX(u))) + "," + I2S(R2I(GetUnitY(u))) + " visible=" + I2S(EF_B2I(IsUnitVisible(u, Player(0))))
    endif
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload(s)
    call Preload(v)
    call PreloadGenEnd({{jReportFile}})
    set u = null
endfunction
