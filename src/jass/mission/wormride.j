// ---- ADV Fremen ride worms (Rules.txt AdvancedFremen: FRADVFremen; Game.exe 1.09 class 0x11, 0x566f30)
// Its deploy (a thumper, button "call a worm") where a WormRider (its Resource; Terrain Sand) could
// stand: after [General] MinWormRideWaitDelay + rand % MaxWormRideWaitDelay ticks it becomes a
// WormRider of its owner where it is (0x597bd0); a new order meanwhile calls the worm off. The
// WormRider (class 0x13, 0x572a60) wanders to random points unless ordered, and after
// WormRiderLifespan ticks turns back into its Resource (FRADVFremen) with its share of health
// (rider health * fremen max / rider max). The veterancy score and level go along.
// EmpRideTab[type]: 0 the type it turns into, 1 = a caller (ADV Fremen), 2 = a rider; [button] 3 = 1;
// [unit] 4 = waiting for a worm, 5 = rider's ticks left.
// A rider does not shoot worms or other riders (0x5728d0: classes Worm, BigWorm, WormRider; units.ts makes
// them WC3 "ancient" and the rider's weapon "nonancient"; probe --boom 2026-10-09).
// TODO(units): Game.exe also needs 0x4e68d0 (global 0x8824e0, not identified) to let it call a worm,
// shows WormSign0 in the last 100 ticks (an art object, not converted) and plays the thumper / ride end
// animations. Risk: a worm can be called where Emperor would not allow it.
// Feature test: test/emperor-mission.test.ts "worm".
function EmpRideData takes nothing returns nothing
    set EmpRideTab = InitHashtable()
    set EmpRideAll = CreateGroup()
{{wormLines}}
endfunction

// u turns into type t where it stands, keeping its owner, facing, share of health and veterancy
function EmpRideSwap takes unit u, integer t returns unit
    local unit n = CreateUnit(GetOwningPlayer(u), t, GetUnitX(u), GetUnitY(u), GetUnitFacing(u))
    local integer a = GetHandleId(u)
    local integer b = GetHandleId(n)
    call SetUnitLifePercentBJ(n, GetUnitLifePercent(u))
    call SaveInteger(EmpVetUnit, b, 0, LoadInteger(EmpVetUnit, a, 0))
    call SaveInteger(EmpVetUnit, b, 1, LoadInteger(EmpVetUnit, a, 1))
    if IsUnitSelected(u, GetOwningPlayer(u)) then
        call SelectUnit(n, true)
    endif
    call RemoveUnit(u)
    return n
endfunction

// a random point of the map for a wandering rider
function EmpRideWander takes unit u returns nothing
    call IssuePointOrder(u, "move", GetRandomReal(EmpMapMinX, EmpMapMaxX), GetRandomReal(EmpMapMinY, EmpMapMaxY))
endfunction

// u plants its thumper, on sand
function EmpRideStart takes unit u returns nothing
    local real x = GetUnitX(u)
    local real y = GetUnitY(u)
    if not EmpAlive(u) or not LoadBoolean(EmpRideTab, EmpType(u), 1) or IsUnitInGroup(u, EmpRideAll) then
        return
    endif
    if GetTerrainType(x, y) == '{{sandTile}}' or GetTerrainType(x, y) == '{{spiceTile}}' then
        call SaveInteger(EmpRideTab, GetHandleId(u), 4, {{WORM.waitMin}} + GetRandomInt(0, {{WORM.waitRollMax}}))
        call GroupAddUnit(EmpRideAll, u)
    elseif GetOwningPlayer(u) == Player(0) then
        call EmpShow({{str WORM.noSand}})
    endif
endfunction

function EmpRideCast takes nothing returns nothing
    if LoadInteger(EmpRideTab, GetSpellAbilityId(), 3) == 1 then
        call EmpRideStart(GetTriggerUnit())
    endif
endfunction

// deploy.j EmpDeployArgs (the scripts' ObjectDeploy: Game.exe 0x4f30b0 deploys any class that can)
function EmpRideArgs takes nothing returns nothing
    call EmpRideStart(EmpDeployArgUnit)
endfunction

// every WORM_TICK: the callers wait (an order calls the worm off), the riders wander and come back
function EmpRideTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local unit n
    local integer h
    local integer left
    call GroupAddGroup(EmpRideAll, g)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set h = GetHandleId(u)
        if not EmpAlive(u) then
            call GroupRemoveUnit(EmpRideAll, u)
            call FlushChildHashtable(EmpRideTab, h)
        elseif LoadBoolean(EmpRideTab, EmpType(u), 1) then
            // (the call button's own channel order is still on just after the cast)
            if GetUnitCurrentOrder(u) != 0 and GetUnitCurrentOrder(u) != OrderId({{str RT.DEPLOY_BUTTON_ORDER}}) then
                call GroupRemoveUnit(EmpRideAll, u)
                call RemoveSavedInteger(EmpRideTab, h, 4)
            else
                set left = LoadInteger(EmpRideTab, h, 4) - {{WORM.tickTicks}}
                call SaveInteger(EmpRideTab, h, 4, left)
                if left <= 0 then
                    call GroupRemoveUnit(EmpRideAll, u)
                    call FlushChildHashtable(EmpRideTab, h)
                    set n = EmpRideSwap(u, LoadInteger(EmpRideTab, EmpType(u), 0))
                    call SaveInteger(EmpRideTab, GetHandleId(n), 5, {{WORM.lifespan}})
                    call GroupAddUnit(EmpRideAll, n)
                    call EmpRideWander(n)
                endif
            endif
        else
            set left = LoadInteger(EmpRideTab, h, 5) - {{WORM.tickTicks}}
            call SaveInteger(EmpRideTab, h, 5, left)
            if left <= 0 then
                call GroupRemoveUnit(EmpRideAll, u)
                call FlushChildHashtable(EmpRideTab, h)
                call EmpRideSwap(u, LoadInteger(EmpRideTab, EmpType(u), 0))
            elseif GetUnitCurrentOrder(u) == 0 then
                call EmpRideWander(u)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set n = null
endfunction

function EmpRideInit takes nothing returns nothing
    local trigger tr = CreateTrigger()
    local integer i = 0
    call EmpRideData()
    loop
        exitwhen i >= bj_MAX_PLAYER_SLOTS
        call TriggerRegisterPlayerUnitEvent(tr, Player(i), EVENT_PLAYER_UNIT_SPELL_EFFECT, null)
        set i = i + 1
    endloop
    call TriggerAddAction(tr, function EmpRideCast)
    call TimerStart(CreateTimer(), {{real WORM.tick}}, true, function EmpRideTick)
    set tr = null
endfunction
