// ---- tech limits by runtime tech level ----
function EmpTechLimits takes nothing returns nothing
    local integer i = 0
    loop
        exitwhen i > {{MAX_SIDE}}
{{limitLines}}
        set i = i + 1
    endloop
endfunction
