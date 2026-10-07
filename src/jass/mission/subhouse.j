// ---- sub-house buildings (config SUBHOUSE_TAGS): locked for every side but the player allied with
// their sub-house; an attack tagged with a sub-house allies it when won (campaign.j wonLines) ----
function EmpSubhouseLimits takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > {{RT.MAX_SIDE}}
{{subLines}}
        set i = i + 1
    endloop
endfunction
