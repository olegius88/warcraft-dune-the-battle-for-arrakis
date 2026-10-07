'use strict';
// JASS runtime implementing the Emperor mission API (EF_<Name>) for translated scripts.
// Signatures are generated from the Game.exe token table (same rules as translate.js), bodies
// come from IMPL below; anything not implemented gets a safe stub (0 / null) marked TODO.
//
// Model: an Emperor "side" is an integer 0..11 mapped to Player(side); side 0 is the human
// player, side 1 the main enemy house (GetEnemySide), CreateSide() hands out 2..11, the neutral
// side is 12 -> Player(PLAYER_NEUTRAL_PASSIVE). Points come from the map's GameElements tree.
// One Emperor tick = 1/25 s (TODO(tick-rate)).

const RET_J = { 0: 'integer', 1: 'location', 2: 'unit', 8: 'nothing' };
const { RETURN_OVERRIDE } = require('./translate');
const ARG_J = (code) => (code === 1 ? 'location' : code === 2 ? 'unit' : 'integer');
const DEFAULT = { integer: 'return 0', location: 'return null', unit: 'return null', nothing: '' };

const HEADER_GLOBALS = `
    integer EmpTick = 0
    integer EmpNextSide = 2
    integer EmpPlayerTerritory = 0
    integer EmpEnemyTerritory = 0
    real array EmpScriptX
    real array EmpScriptY
    integer EmpBaseCount = 0
    real array EmpBaseX
    real array EmpBaseY
    integer array EmpBaseOwner
    integer array EmpSideBase
    integer EmpEntrCount = 0
    real array EmpEntrX
    real array EmpEntrY
    integer array EmpEntrTag
    string array EmpMsgText
    string array EmpTipText
    boolean array EmpAttacked
    integer array EmpAIMode
    location array EmpAITarget
    unit array EmpAIUnit
    integer array EmpAITargetSide
    boolean array EmpAIControlled
    integer EmpOutcome = -1
    boolean EmpEnded = false
    location EmpCamStore = null
    boolean EmpCamSet = false
    real EmpMapMinX = 0.0
    real EmpMapMinY = 0.0
    real EmpMapMaxX = 0.0
    real EmpMapMaxY = 0.0
    group EmpTmpGroup = null
    integer EmpTmpSide = 0
    integer EmpTmpCount = 0
    integer EmpTmpType = 0
    real EmpTmpX = 0.0
    real EmpTmpY = 0.0
    real EmpTmpR = 0.0
    boolean EmpTmpBool = false
    unit EmpTmpUnit = null
    boolean EmpNormalConditions = true
    integer EmpLastBuiltSide = -1
    unit EmpLastBuilt = null
    integer EmpLastDelivered = -1
    boolean EmpDefendMode = false
    integer EmpWavesLeft = 0
    boolean EmpEndWin = false
    boolean EmpResultSent = false
    timer EmpTimer = null
    timerdialog EmpTimerWindow = null`;

// Helper JASS functions (placed before the EF_ functions).
const HELPERS = `
function EmpSidePlayer takes integer side returns player
    if side >= 0 and side <= 11 then
        return Player(side)
    endif
    return Player(PLAYER_NEUTRAL_PASSIVE)
endfunction

function EmpPlayerSide takes player p returns integer
    local integer id = GetPlayerId(p)
    if id <= 11 then
        return id
    endif
    return 12
endfunction

function EF_B2I takes boolean b returns integer
    if b then
        return 1
    endif
    return 0
endfunction

function EmpAlive takes unit u returns boolean
    return u != null and GetUnitTypeId(u) != 0 and not IsUnitType(u, UNIT_TYPE_DEAD)
endfunction

function EmpTiles takes integer t returns real
    return I2R(t) * 128.0
endfunction

function EmpCountEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    if EmpAlive(u) and (EmpTmpType == 0 or (EmpTmpType == 1 and not IsUnitType(u, UNIT_TYPE_STRUCTURE)) or (EmpTmpType == 2 and IsUnitType(u, UNIT_TYPE_STRUCTURE)) or GetUnitTypeId(u) == EmpTmpType) then
        set EmpTmpCount = EmpTmpCount + 1
    endif
    set u = null
    return false
endfunction

// kind: 0 all, 1 units only, 2 buildings only, otherwise a unit type id
function EmpCount takes integer side, integer kind returns integer
    set EmpTmpCount = 0
    set EmpTmpType = kind
    call GroupEnumUnitsOfPlayer(EmpTmpGroup, EmpSidePlayer(side), Filter(function EmpCountEnum))
    return EmpTmpCount
endfunction

function EmpNearEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    if EmpAlive(u) and GetOwningPlayer(u) == EmpSidePlayer(EmpTmpSide) then
        set EmpTmpBool = true
    endif
    set u = null
    return false
endfunction

function EmpSideNear takes integer side, real x, real y, real r returns boolean
    set EmpTmpSide = side
    set EmpTmpBool = false
    call GroupEnumUnitsInRange(EmpTmpGroup, x, y, r, Filter(function EmpNearEnum))
    return EmpTmpBool
endfunction

function EmpFirstEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    if EmpTmpUnit == null and EmpAlive(u) and (EmpTmpType == 0 or not IsUnitType(u, UNIT_TYPE_STRUCTURE)) then
        set EmpTmpUnit = u
    endif
    set u = null
    return false
endfunction

function EmpFirstUnit takes integer side, boolean mobileOnly returns unit
    set EmpTmpUnit = null
    set EmpTmpType = 0
    if mobileOnly then
        set EmpTmpType = 1
    endif
    call GroupEnumUnitsOfPlayer(EmpTmpGroup, EmpSidePlayer(side), Filter(function EmpFirstEnum))
    return EmpTmpUnit
endfunction

function EmpClampX takes real x returns real
    if x < EmpMapMinX then
        return EmpMapMinX
    elseif x > EmpMapMaxX then
        return EmpMapMaxX
    endif
    return x
endfunction

function EmpClampY takes real y returns real
    if y < EmpMapMinY then
        return EmpMapMinY
    elseif y > EmpMapMaxY then
        return EmpMapMaxY
    endif
    return y
endfunction

function EmpBaseOfSide takes integer side returns integer
    local integer i = EmpSideBase[side]
    if i >= 0 and i < EmpBaseCount then
        return i
    endif
    // allocate the first free base point
    set i = 0
    loop
        exitwhen i >= EmpBaseCount
        if EmpBaseOwner[i] < 0 then
            set EmpBaseOwner[i] = side
            set EmpSideBase[side] = i
            return i
        endif
        set i = i + 1
    endloop
    return 0
endfunction

function EmpEntranceFor takes integer side returns integer
    local integer i = 0
    local integer want = EmpPlayerTerritory
    if side != 0 then
        set want = EmpEnemyTerritory
    endif
    loop
        exitwhen i >= EmpEntrCount
        if EmpEntrTag[i] == want then
            return i
        endif
        set i = i + 1
    endloop
    // fall back to the first non-neutral entrance (player) or the last one (others)
    set i = 0
    loop
        exitwhen i >= EmpEntrCount
        if EmpEntrTag[i] != 99 and (side == 0 or i > 0) then
            return i
        endif
        set i = i + 1
    endloop
    return 0
endfunction

function EmpShow takes string s returns nothing
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, 15.0, s)
endfunction

// ---- side AI (simple order-based behaviour) ----
// modes: 0 none, 1 aggressive (attack nearest enemy base), 2 move to point, 3 exit map,
//        4 guard object, 5 attack object, 6 headless chicken, 7 stop
function EmpAIOrderEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    local integer side = EmpTmpSide
    local integer m = EmpAIMode[side]
    local integer b
    if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and GetUnitCurrentOrder(u) == 0 then
        if m == 1 then
            set b = EmpBaseOfSide(EmpAITargetSide[side])
            call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
        elseif m == 2 and EmpAITarget[side] != null then
            call IssuePointOrderLoc(u, "move", EmpAITarget[side])
        elseif m == 3 then
            if IsUnitInRangeXY(u, EmpTmpX, EmpTmpY, 256.0) then
                call RemoveUnit(u)
            else
                call IssuePointOrder(u, "move", EmpTmpX, EmpTmpY)
            endif
        elseif (m == 4 or m == 5) and EmpAlive(EmpAIUnit[side]) then
            if m == 5 then
                call IssueTargetOrder(u, "attack", EmpAIUnit[side])
            else
                call IssuePointOrder(u, "attack", GetUnitX(EmpAIUnit[side]), GetUnitY(EmpAIUnit[side]))
            endif
        elseif m == 6 then
            call IssuePointOrder(u, "move", EmpClampX(GetUnitX(u) + GetRandomReal(-800, 800)), EmpClampY(GetUnitY(u) + GetRandomReal(-800, 800)))
        endif
    endif
    set u = null
    return false
endfunction

function EmpAITick takes nothing returns nothing
    local integer side = 1
    loop
        exitwhen side > 12
        if EmpAIMode[side] != 0 then
            set EmpTmpSide = side
            // nearest map edge point for "exit map"
            set EmpTmpX = EmpMapMinX
            set EmpTmpY = (EmpMapMinY + EmpMapMaxY) / 2
            call GroupEnumUnitsOfPlayer(EmpTmpGroup, EmpSidePlayer(side), Filter(function EmpAIOrderEnum))
        endif
        set side = side + 1
    endloop
endfunction

function EmpOnAttacked takes nothing returns nothing
    local integer a = EmpPlayerSide(GetOwningPlayer(GetAttacker()))
    local integer b = EmpPlayerSide(GetOwningPlayer(GetTriggerUnit()))
    set EmpAttacked[a * 16 + b] = true
endfunction

function EmpOnConstructed takes nothing returns nothing
    set EmpLastBuilt = GetConstructedStructure()
    set EmpLastBuiltSide = EmpPlayerSide(GetOwningPlayer(EmpLastBuilt))
endfunction

// Records the mission result; the mission's tick handler (declared after the campaign glue)
// delivers it via EmpCampaignResult.
function EmpEnd takes boolean win returns nothing
    if EmpEnded then
        return
    endif
    set EmpEnded = true
    set EmpEndWin = win
endfunction

// Normal Emperor win/lose rule for territory battles: the enemy house loses all buildings ->
// win; the player has neither buildings nor units -> lose. Story scripts end the game themselves.
function EmpNormalCheck takes nothing returns nothing
    if not EmpNormalConditions or EmpEnded or EmpTick < 250 then
        return
    endif
    if EmpDefendMode then
        // defence: all attack waves have arrived and none of the attackers is left
        if EmpWavesLeft == 0 and EmpCount(1, 0) == 0 then
            call EmpEnd(true)
        elseif EmpCount(0, 2) == 0 then
            call EmpEnd(false)
        endif
    elseif EmpCount(1, 2) == 0 and EmpCount(1, 1) == 0 then
        call EmpEnd(true)
    elseif EmpCount(0, 0) == 0 then
        call EmpEnd(false)
    endif
endfunction`;

// Bodies for EF_ functions. Parameters are a1..aN in declaration order.
const IMPL = {
  ModelTick: 'return EmpTick',
  Random: 'return GetRandomInt(0, IMaxBJ(a1 - 1, 0))',
  Multiplayer: 'return 0',
  Neg: 'return -a1',
  SetValue: 'return a1',
  GetPlayerSide: 'return 0',
  GetSecondPlayerSide: 'return 0',
  GetEnemySide: 'return 1',
  GetNeutralSide: 'return 12',
  CreateSide: `local integer s = EmpNextSide
    if EmpNextSide < 11 then
        set EmpNextSide = EmpNextSide + 1
    endif
    set EmpSideBase[s] = -1
    return s`,
  GetObjectSide: 'return EmpPlayerSide(GetOwningPlayer(a1))',
  GetSideCash: 'return GetPlayerState(EmpSidePlayer(a1), PLAYER_STATE_RESOURCE_GOLD)',
  GetSideSpice: 'return GetPlayerState(EmpSidePlayer(a1), PLAYER_STATE_RESOURCE_GOLD)',
  AddSideCash: 'call AdjustPlayerStateBJ(a2, EmpSidePlayer(a1), PLAYER_STATE_RESOURCE_GOLD)',
  SetSideCash: 'call SetPlayerStateBJ(EmpSidePlayer(a1), PLAYER_STATE_RESOURCE_GOLD, a2)',
  SetSideColor: 'call SetPlayerColorBJ(EmpSidePlayer(a1), ConvertPlayerColor(ModuloInteger(a2, 12)), true)',
  GetSideColor: 'return GetHandleId(GetPlayerColor(EmpSidePlayer(a1)))',
  // ---- points ----
  GetScriptPoint: 'return Location(EmpScriptX[a1], EmpScriptY[a1])',
  GetSideBasePoint: `local integer b = EmpBaseOfSide(a1)
    return Location(EmpBaseX[b], EmpBaseY[b])`,
  GetUnusedBasePoint: `local integer i = 0
    loop
        exitwhen i >= EmpBaseCount
        if EmpBaseOwner[i] < 0 then
            set EmpBaseOwner[i] = 99
            return Location(EmpBaseX[i], EmpBaseY[i])
        endif
        set i = i + 1
    endloop
    return Location(EmpBaseX[0], EmpBaseY[0])`,
  GetEntrancePoint: `local integer i = EmpEntranceFor(a1)
    return Location(EmpEntrX[i], EmpEntrY[i])`,
  GetNeutralEntrancePoint: `local integer i = 0
    local integer pick = -1
    loop
        exitwhen i >= EmpEntrCount
        if EmpEntrTag[i] == 99 and (pick < 0 or GetRandomInt(0, 1) == 0) then
            set pick = i
        endif
        set i = i + 1
    endloop
    if pick < 0 then
        set pick = EmpEntrCount - 1
    endif
    return Location(EmpEntrX[pick], EmpEntrY[pick])`,
  GetNeutralExitPoint: 'return EF_GetNeutralEntrancePoint()',
  GetExitPoint: 'return EF_GetEntrancePoint(a1)',
  GetEntrancePointByIndex: `local integer i = ModuloInteger(a1, IMaxBJ(EmpEntrCount, 1))
    return Location(EmpEntrX[i], EmpEntrY[i])`,
  GetEntranceNearToPos: `local integer i = 0
    local integer best = 0
    local real bd = 1000000000.0
    local real d
    loop
        exitwhen i >= EmpEntrCount
        set d = (EmpEntrX[i] - GetLocationX(a1)) * (EmpEntrX[i] - GetLocationX(a1)) + (EmpEntrY[i] - GetLocationY(a1)) * (EmpEntrY[i] - GetLocationY(a1))
        if d < bd then
            set bd = d
            set best = i
        endif
        set i = i + 1
    endloop
    return Location(EmpEntrX[best], EmpEntrY[best])`,
  GetEntranceFarFromPos: `local integer i = 0
    local integer best = 0
    local real bd = -1.0
    local real d
    loop
        exitwhen i >= EmpEntrCount
        set d = (EmpEntrX[i] - GetLocationX(a1)) * (EmpEntrX[i] - GetLocationX(a1)) + (EmpEntrY[i] - GetLocationY(a1)) * (EmpEntrY[i] - GetLocationY(a1))
        if d > bd then
            set bd = d
            set best = i
        endif
        set i = i + 1
    endloop
    return Location(EmpEntrX[best], EmpEntrY[best])`,
  GetSidePosition: `local unit u = EmpFirstUnit(a1, false)
    if u == null then
        return EF_GetSideBasePoint(a1)
    endif
    return GetUnitLoc(u)`,
  GetObjectPosition: `if a1 == null then
        return Location(0, 0)
    endif
    return GetUnitLoc(a1)`,
  SetTilePos: 'return Location(EmpTiles(a1), EmpTiles(a2))',
  // ---- objects ----
  NewObject: `if a3 == null or a2 <= 0 then
        return null
    endif
    return CreateUnit(EmpSidePlayer(a1), a2, GetLocationX(a3) + GetRandomReal(-96, 96), GetLocationY(a3) + GetRandomReal(-96, 96), 270.0)`,
  NewObjectOffsetOrientation: `if a3 == null or a2 <= 0 then
        return null
    endif
    // offsets are in tiles; Emperor y grows downwards; orientation 0..3 = 90 degree steps
    return CreateUnit(EmpSidePlayer(a1), a2, GetLocationX(a3) + EmpTiles(a4), GetLocationY(a3) - EmpTiles(a5), 270.0 - 90.0 * a6)`,
  // (side, type, transport unit): spawn next to the transport
  NewObjectInAPC: `if not EmpAlive(a3) or a2 <= 0 then
        return null
    endif
    return CreateUnit(EmpSidePlayer(a1), a2, GetUnitX(a3), GetUnitY(a3), GetUnitFacing(a3))`,
  BuildObject: `local integer b = EmpBaseOfSide(a1)
    call CreateUnit(EmpSidePlayer(a1), a2, EmpBaseX[b], EmpBaseY[b], 270.0)`,
  ObjectValid: 'return EF_B2I(EmpAlive(a1))',
  ObjectDestroyed: 'return EF_B2I(a1 == null or not EmpAlive(a1))',
  EventObjectDestroyed: 'return EF_B2I(a1 != null and not EmpAlive(a1))',
  ObjectGetHealth: `if not EmpAlive(a1) then
        return 0
    endif
    return R2I(GetUnitLifePercent(a1))`,
  ObjectMaxHealth: 'return 100',
  ObjectSetHealth: `if EmpAlive(a1) then
        call SetUnitLifePercentBJ(a1, IMaxBJ(1, a2))
    endif`,
  ObjectChangeSide: `if EmpAlive(a1) then
        call SetUnitOwner(a1, EmpSidePlayer(a2), true)
    endif`,
  ObjectDetonate: `if EmpAlive(a1) then
        call DestroyEffect(AddSpecialEffect("Objects\\\\Spawnmodels\\\\Other\\\\NeutralBuildingExplosion\\\\NeutralBuildingExplosion.mdl", GetUnitX(a1), GetUnitY(a1)))
        call KillUnit(a1)
    endif`,
  // returns the replacement unit (see RETURN_OVERRIDE)
  ObjectChange: `local unit u = null
    if EmpAlive(a1) then
        set u = CreateUnit(GetOwningPlayer(a1), a2, GetUnitX(a1), GetUnitY(a1), GetUnitFacing(a1))
        call RemoveUnit(a1)
    endif
    return u`,
  ObjectInfect: `local unit u = null
    if EmpAlive(a1) then
        set u = CreateUnit(GetOwningPlayer(a1), a2, GetUnitX(a1), GetUnitY(a1), GetUnitFacing(a1))
        call KillUnit(a1)
    endif
    return u`,
  ObjectToolTip: `if EmpAlive(a1) and EmpTipText[a2] != null then
        call BlzSetUnitName(a1, EmpTipText[a2])
    endif`,
  ObjectDeploy: `local unit u
    // MCV deploys into a construction yard of its house (resolved at build time: EmpDeployType)
    if EmpAlive(a1) and EmpDeployType(GetUnitTypeId(a1)) != 0 then
        set u = CreateUnit(GetOwningPlayer(a1), EmpDeployType(GetUnitTypeId(a1)), GetUnitX(a1), GetUnitY(a1), 270.0)
        call RemoveUnit(a1)
        set u = null
    endif`,
  ObjectSell: `if a1 != null then
        call RemoveUnit(a1)
    endif`,
  ObjectRemove: `if a1 != null then
        call RemoveUnit(a1)
    endif`,
  ObjectIsCarried: 'return 0',
  // (obj, side)
  ObjectNearToSide: `if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(EmpSideNear(a2, GetUnitX(a1), GetUnitY(a1), 1280.0))`,
  // (obj, side)
  ObjectNearToSideBase: `local integer b = EmpBaseOfSide(a2)
    if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(IsUnitInRangeXY(a1, EmpBaseX[b], EmpBaseY[b], 2048.0))`,
  ObjectNearToObject: `if not EmpAlive(a1) or not EmpAlive(a2) then
        return 0
    endif
    return EF_B2I(IsUnitInRange(a1, a2, 1024.0))`,
  // (obj, side)
  ObjectVisibleToSide: `if not EmpAlive(a1) then
        return 0
    endif
    return EF_B2I(IsUnitVisible(a1, EmpSidePlayer(a2)))`,
  // (type, side): any unit of that type (any owner) visible to the side — approximated by existence
  ObjectTypeVisibleToSide: 'return EF_B2I(EmpCount(a2, a1) > 0)',
  // side a1 visible to side a2
  SideVisibleToSide: `local unit u = EmpFirstUnit(a1, false)
    return EF_B2I(u != null and IsUnitVisible(u, EmpSidePlayer(a2)))`,
  SideNearToSide: `local unit u = EmpFirstUnit(a2, false)
    if u == null then
        return 0
    endif
    return EF_B2I(EmpSideNear(a1, GetUnitX(u), GetUnitY(u), 1536.0))`,
  SideNearToSideBase: `local integer b = EmpBaseOfSide(a2)
    return EF_B2I(EmpSideNear(a1, EmpBaseX[b], EmpBaseY[b], 2048.0))`,
  SideNearToPoint: `if a2 == null then
        return 0
    endif
    return EF_B2I(EmpSideNear(a1, GetLocationX(a2), GetLocationY(a2), 1024.0))`,
  SideUnitCount: 'return EmpCount(a1, 1)',
  SideBuildingCount: 'return EmpCount(a1, 2)',
  SideObjectCount: 'return EmpCount(a1, a2)',
  // ---- events ----
  EventSideAttacksSide: `local boolean b = EmpAttacked[a1 * 16 + a2]
    set EmpAttacked[a1 * 16 + a2] = false
    return EF_B2I(b)`,
  EventObjectAttacksSide: 'return 0',
  EventObjectConstructed: `if EmpLastBuiltSide == a1 and EmpLastBuilt != null then
        set EmpLastBuiltSide = -1
        return 1
    endif
    return 0`,
  EventObjectTypeConstructed: `if EmpLastBuiltSide == a1 and EmpLastBuilt != null and GetUnitTypeId(EmpLastBuilt) == a2 then
        set EmpLastBuiltSide = -1
        return 1
    endif
    return 0`,
  EventObjectDelivered: 'return 0',
  // ---- messages ----
  Message: `if EmpMsgText[a1] != null then
        call EmpShow(EmpMsgText[a1])
    endif`,
  GiftingMessage: 'call EmpShow("Получены подарки.")',
  // countdown of a1 ticks shown as a timer window
  TimerMessage: `if EmpTimer == null then
        set EmpTimer = CreateTimer()
        set EmpTimerWindow = CreateTimerDialog(EmpTimer)
        call TimerDialogSetTitle(EmpTimerWindow, "Осталось:")
    endif
    call TimerStart(EmpTimer, I2R(IMaxBJ(a1, 0)) / 25.0, false, null)
    call TimerDialogDisplay(EmpTimerWindow, true)`,
  TimerMessageRemove: `if EmpTimerWindow != null then
        call TimerDialogDisplay(EmpTimerWindow, false)
    endif`,
  // ---- diplomacy ----
  SideFriendTo: 'call SetPlayerAllianceStateBJ(EmpSidePlayer(a1), EmpSidePlayer(a2), bj_ALLIANCE_ALLIED_VISION)',
  SideEnemyTo: 'call SetPlayerAllianceStateBJ(EmpSidePlayer(a1), EmpSidePlayer(a2), bj_ALLIANCE_UNALLIED)',
  SideNeutralTo: 'call SetPlayerAllianceStateBJ(EmpSidePlayer(a1), EmpSidePlayer(a2), bj_ALLIANCE_NEUTRAL)',
  SideChangeSide: `local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsOfPlayer(g, EmpSidePlayer(a1), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        call SetUnitOwner(u, EmpSidePlayer(a2), true)
    endloop
    call DestroyGroup(g)
    set g = null`,
  // ---- AI ----
  SideAIControl: `set EmpAIControlled[a1] = true
    set EmpAIMode[a1] = 1
    set EmpAITargetSide[a1] = 0`,
  SideAIAggressive: `set EmpAIMode[a1] = 1
    set EmpAITargetSide[a1] = 0`,
  SideAIAggressiveTowards: `set EmpAIMode[a1] = 1
    set EmpAITargetSide[a1] = a2`,
  SideAIBehaviourAggressive: 'set EmpAIMode[a1] = 1',
  SideAIBehaviourNormal: '',
  SideAIBehaviourDefensive: 'set EmpAIMode[a1] = 0',
  SideAIBehaviourRetreat: 'set EmpAIMode[a1] = 3',
  SideAIEncounterIgnore: '',
  SideAIEncounterAttack: '',
  SideAIMove: `set EmpAIMode[a1] = 2
    set EmpAITarget[a1] = a2`,
  SideAIStop: 'set EmpAIMode[a1] = 0',
  SideAIAttackObject: `set EmpAIMode[a1] = 5
    set EmpAIUnit[a1] = a2`,
  SideAIGuardObject: `set EmpAIMode[a1] = 4
    set EmpAIUnit[a1] = a2`,
  SideAIExitMap: 'set EmpAIMode[a1] = 3',
  SideAIEnterBuilding: `set EmpAIMode[a1] = 4
    set EmpAIUnit[a1] = a2`,
  SideAIHeadlessChicken: 'set EmpAIMode[a1] = 6',
  SideAIShuffle: 'set EmpAIMode[a1] = 6',
  SideAIDone: `local unit u = EmpFirstUnit(a1, true)
    if u == null then
        return 1
    endif
    if EmpAIMode[a1] == 2 and EmpAITarget[a1] != null then
        return EF_B2I(IsUnitInRangeLoc(u, EmpAITarget[a1], 512.0))
    endif
    return EF_B2I(GetUnitCurrentOrder(u) == 0)`,
  // ---- mission ----
  MissionOutcome: 'set EmpOutcome = a1',
  EndGameWin: 'call EmpEnd(true)',
  EndGameLose: 'call EmpEnd(false)',
  NormalConditionLose: 'return EF_B2I(EmpCount(a1, 0) == 0)',
  // ---- shroud / radar / camera / UI ----
  RemoveShroud: `if a1 != null then
        call FogModifierStart(CreateFogModifierRadiusLoc(Player(0), FOG_OF_WAR_VISIBLE, a1, EmpTiles(a2), true, false))
    endif`,
  ReplaceShroud: '',
  RemoveMapShroud: 'call FogModifierStart(CreateFogModifierRect(Player(0), FOG_OF_WAR_VISIBLE, bj_mapInitialPlayableArea, true, false))',
  RadarEnabled: '',
  RadarAlert: `if a1 != null then
        call PingMinimapLocForForce(GetPlayersAll(), a1, 3.0)
    endif`,
  CameraLookAtPoint: `if a1 != null then
        set EmpCamSet = true
        call SetCameraPositionLocForPlayer(Player(0), a1)
    endif`,
  CameraPanToPoint: `if a1 != null then
        set EmpCamSet = true
        call PanCameraToTimedLocForPlayer(Player(0), a1, I2R(IMaxBJ(a2, 1)) / 25.0)
    endif`,
  CameraScrollToPoint: 'call EF_CameraPanToPoint(a1, a2)',
  CameraTrackObject: `if EmpAlive(a1) then
        call SetCameraTargetControllerNoZForPlayer(Player(0), a1, 0, 0, false)
    endif`,
  CameraStopTrack: 'call ResetToGameCameraForPlayer(Player(0), 0)',
  CameraStore: 'set EmpCamStore = GetCameraTargetPositionLoc()',
  CameraRestore: `if EmpCamStore != null then
        call PanCameraToTimedLocForPlayer(Player(0), EmpCamStore, I2R(IMaxBJ(a1, 1)) / 25.0)
    endif`,
  CameraStartRotate: '',
  CameraStopRotate: '',
  PIPCameraTrackObject: '',
  PIPRelease: '',
  // in-engine cut-scenes: Emperor hides its UI while the script moves the camera
  DisableUI: `call ShowInterface(false, 0.5)
    call EnableUserControl(false)`,
  EnableUI: `call ShowInterface(true, 0.5)
    call EnableUserControl(true)`,
  FreezeGame: 'call PauseAllUnitsBJ(true)',
  UnFreezeGame: 'call PauseAllUnitsBJ(false)',
  // ---- reinforcements / deliveries ----
  CarryAllDelivery: 'return EF_NewObject(a1, a2, a3)',
  Delivery: `local integer i = 0
    if a2 == null then
        return
    endif
    if a3 > 0 then
        call EF_NewObject(a1, a3, a2)
    endif
    if a4 > 0 then
        call EF_NewObject(a1, a4, a2)
    endif
    if a5 > 0 then
        call EF_NewObject(a1, a5, a2)
    endif
    if a6 > 0 then
        call EF_NewObject(a1, a6, a2)
    endif
    if a7 > 0 then
        call EF_NewObject(a1, a7, a2)
    endif
    if a8 > 0 then
        call EF_NewObject(a1, a8, a2)
    endif
    if a9 > 0 then
        call EF_NewObject(a1, a9, a2)
    endif
    if a10 > 0 then
        call EF_NewObject(a1, a10, a2)
    endif`,
  StarportDelivery: 'call EF_Delivery(a1, EF_GetSideBasePoint(a1), a2, a3, a4, a5, a6, a7, a8, a9)',
  NewCrateCash: `if a1 != null then
        call CreateItem('gold', GetLocationX(a1), GetLocationY(a1))
    endif`,
  NewCrateUnit: `if a1 != null then
        call CreateUnit(Player(0), a2, GetLocationX(a1), GetLocationY(a1), 270.0)
    endif`,
  ForceWormStrike: `local group g
    local unit u
    if a1 == null then
        return
    endif
    set g = CreateGroup()
    call GroupEnumUnitsInRangeOfLoc(g, a1, EmpTiles(3), null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if not IsUnitType(u, UNIT_TYPE_STRUCTURE) and not IsUnitType(u, UNIT_TYPE_FLYING) then
            call KillUnit(u)
        endif
    endloop
    call DestroyEffect(AddSpecialEffectLoc("Objects\\\\Spawnmodels\\\\Undead\\\\ImpaleTargetDust\\\\ImpaleTargetDust.mdl", a1))
    call DestroyGroup(g)
    set g = null`,
  SideNuke: '',
  SideNukeAll: '',
};

/** Build the runtime: globals block lines and functions text for the given token table. */
function buildRuntime(table, { deployMap = {} } = {}) {
  const fns = [];
  // MCV/ConYard deploy table (generated): returns the construction yard type for an MCV type.
  const deploy = Object.entries(deployMap).map(([from, to]) => `    if t == '${from}' then\n        return '${to}'\n    endif`).join('\n');
  fns.push(`function EmpDeployType takes integer t returns integer\n${deploy}\n    return 0\nendfunction`);
  const stubbed = [];
  for (const e of table) {
    if (e.kind !== 0) continue;
    const n = Math.min(e.argCount, 10);
    const params = Array.from({ length: n }, (_, i) => `${ARG_J(e.argTypes[i] != null ? e.argTypes[i] : 0)} a${i + 1}`);
    const ret = RET_J[RETURN_OVERRIDE[e.name] != null ? RETURN_OVERRIDE[e.name] : e.returnType] || 'integer';
    let body = IMPL[e.name];
    if (body == null) { body = DEFAULT[ret]; stubbed.push(e.name); if (ret === 'nothing') body = `// TODO(runtime): ${e.name} not implemented`; else body = `// TODO(runtime): ${e.name} not implemented\n    ${DEFAULT[ret]}`; }
    if (ret === 'nothing' && /^\s*return\s+\S/.test(body)) body = body.replace(/^\s*return\s+/, 'call ');
    fns.push(`function EF_${e.name} takes ${params.length ? params.join(', ') : 'nothing'} returns ${ret}\n    ${body}\nendfunction`);
  }
  return { globals: HEADER_GLOBALS, helpers: HELPERS, functions: fns.join('\n\n'), stubbed };
}

module.exports = { buildRuntime, IMPL };
