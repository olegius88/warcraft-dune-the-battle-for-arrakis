// ---- Rules.txt Selectable = FALSE (carryalls, worms, walls, the storm, scenery) ----
// The player cannot select such a unit in Emperor; here one selected is dropped from the selection at
// once (a box over it and others keeps the others). Test "a stuck harvester gets a carryall, and
// carryalls cannot be selected".
function EmpUnselectable takes integer t returns boolean
    return {{isUnselectable}}
endfunction

function EmpUnselect takes nothing returns nothing
    local unit u = GetTriggerUnit()
    if EmpUnselectable(EmpType(u)) then
        call SelectUnit(u, false)
    endif
    set u = null
endfunction

function EmpSelectInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_SELECTED, null)
    call TriggerAddAction(tr, function EmpUnselect)
    set tr = null
endfunction
