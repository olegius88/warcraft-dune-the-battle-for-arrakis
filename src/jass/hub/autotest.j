function EmpAutoAttack takes nothing returns nothing
    local integer n = 1
    if EmpBusy then
        return
    endif
    loop
        exitwhen n > {{TERRITORY_COUNT}}
        if EmpOwner[n] != {{me}} and EmpAdjacentToMe(n) and EmpMapA[n] != "" and {{notEnemyCapitalN}} then
            set EmpBusy = true
            set EmpPendTerr = n
            set EmpPendKind = {{KIND_ID.attack}}
            set EmpPendEnemy = EmpOwner[n]
            set EmpNextMap = EmpMapA[n]
            call EmpSay("Автотест: атака на «" + EmpTName[n] + "»")
            call EmpGo()
            return
        endif
        set n = n + 1
    endloop
endfunction

function EmpAutoReport takes nothing returns nothing
    local integer v = GetStoredInteger(EmpCache, {{CAT}}, {{K.autotestVisits}}) + 1
    call StoreInteger(EmpCache, {{CAT}}, {{K.autotestVisits}}, v)
    call SaveGameCache(EmpCache)
    call PreloadGenClear()
    call PreloadGenStart()
    call Preload("visit=" + I2S(v) + " phase=" + I2S(EmpPhase) + " tech=" + I2S(EmpTech) + " captured=" + I2S(EmpCaptured) + " owned=" + I2S(EmpCount({{me}})){{allyReport}}{{#if musicList}} + " music=" + I2S(GetSoundFileDuration({{jFirstTrack}})){{/if}})
    call PreloadGenEnd({{jReportPrefix}} + I2S(v) + ".pld")
    if v == 1 then
        call TimerStart(CreateTimer(), {{real AUTOTEST_HUB_DELAY}}, false, function EmpAutoAttack)
    endif
endfunction


