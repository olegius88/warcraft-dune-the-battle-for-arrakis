// automatic flow test: win after a delay; the start mission also begins a fresh campaign
function EmpAutoWin takes nothing returns nothing
{{#if isStart}}    call StoreInteger(EmpCache, {{CAT}}, {{K.init}}, 0)
    call StoreInteger(EmpCache, {{CAT}}, {{K.autotestVisits}}, 0)
    call SaveGameCache(EmpCache)
{{/if}}    call EmpEnd(true)
endfunction
