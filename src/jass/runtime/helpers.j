
function EmpSidePlayer takes integer side returns player
    if side >= 0 and side <= {{RT.MAX_SIDE}} then
        return Player(side)
    endif
    return Player(PLAYER_NEUTRAL_PASSIVE)
endfunction

function EmpPlayerSide takes player p returns integer
    local integer id = GetPlayerId(p)
    if id <= {{RT.MAX_SIDE}} then
        return id
    endif
    return {{RT.NEUTRAL_SIDE}}
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
    return I2R(t) * {{real WC3_UNITS_PER_TILE}}
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

// Emperor sides are not enemies until a script says so (SideEnemyTo is called 1404 times in the
// scripts); only the player and the main enemy start hostile. WC3 players on separate teams start as
// enemies, so everything else is made neutral before the scripts run (regression test:
// test/emperor-mission.test.ts).
function EmpDefaultDiplomacy takes nothing returns nothing
    local integer a = 0
    local integer b
    loop
        exitwhen a > {{RT.MAX_SIDE}}
        set b = 0
        loop
            exitwhen b > {{RT.MAX_SIDE}}
            if a != b and not ((a == 0 and b == 1) or (a == 1 and b == 0)) then
                call SetPlayerAllianceStateBJ(Player(a), Player(b), bj_ALLIANCE_NEUTRAL)
            endif
            set b = b + 1
        endloop
        set a = a + 1
    endloop
endfunction

// one aircraft of an AirStrike: created at the entry point, attack-moves to the target base
function EmpStrikeAdd takes integer slot, integer side, integer t, location from, integer b returns nothing
    local unit u
    if t <= 0 then
        return
    endif
    set u = CreateUnit(EmpSidePlayer(side), t, GetLocationX(from), GetLocationY(from), {{FACING}})
    call GroupAddUnit(EmpStrike[slot], u)
    call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
    set u = null
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
        if EmpEntrTag[i] != {{RT.NEUTRAL_TAG}} and (side == 0 or i > 0) then
            return i
        endif
        set i = i + 1
    endloop
    return 0
endfunction

// ---- speech queue: one line at a time, like Emperor's Mentat. The length of each line is known at
// build time (GetSoundIsPlaying is unreliable right after StartSound), so the queue waits by time.
function EmpSpeechTick takes nothing returns nothing
    local sound s
    set EmpSpeechLeft = EmpSpeechLeft - {{real RT.SPEECH_TICK}}
    if EmpSpeechLeft > 0.0 or EmpSpeechHead >= EmpSpeechTail then
        return
    endif
    set s = CreateSound(EmpSpeechQ[EmpSpeechHead], false, false, false, 10, 10, "")
    call SetSoundVolume(s, {{RT.SPEECH_VOLUME}})
    call StartSound(s)
    call KillSoundWhenDone(s)
    set EmpSpeechLeft = EmpSpeechQLen[EmpSpeechHead] + {{real RT.SPEECH_GAP}}
    // for the debug report: did the engine open/decode the file? (0 = no)
    set EmpSpeechLastMs = GetSoundFileDuration(EmpSpeechQ[EmpSpeechHead])
    set EmpSpeechHead = EmpSpeechHead + 1
    set s = null
endfunction

function EmpSpeak takes string path, real seconds returns nothing
    if path == null or path == "" then
        return
    endif
    if EmpSpeechTimer == null then
        set EmpSpeechTimer = CreateTimer()
        call TimerStart(EmpSpeechTimer, {{real RT.SPEECH_TICK}}, true, function EmpSpeechTick)
    endif
    // drop lines rather than lag far behind the action
    if EmpSpeechTail - EmpSpeechHead < {{RT.SPEECH_QUEUE_MAX}} and EmpSpeechTail < {{RT.SPEECH_ARRAY_LIMIT}} then
        set EmpSpeechQ[EmpSpeechTail] = path
        set EmpSpeechQLen[EmpSpeechTail] = seconds
        set EmpSpeechTail = EmpSpeechTail + 1
    endif
endfunction

function EmpShow takes string s returns nothing
    call DisplayTimedTextToPlayer(Player(0), 0.0, 0.0, {{real RT.MESSAGE_SECONDS}}, s)
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
            if IsUnitInRangeXY(u, EmpTmpX, EmpTmpY, {{real RT.AI_GUARD_RADIUS}}) then
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
            call IssuePointOrder(u, "move", EmpClampX(GetUnitX(u) + GetRandomReal(-{{RT.AI_WANDER}}, {{RT.AI_WANDER}})), EmpClampY(GetUnitY(u) + GetRandomReal(-{{RT.AI_WANDER}}, {{RT.AI_WANDER}})))
        endif
    endif
    set u = null
    return false
endfunction

function EmpAITick takes nothing returns nothing
    local integer side = 1
    loop
        exitwhen side > {{RT.NEUTRAL_SIDE}}
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
    set EmpAttacked[a * {{RT.SIDE_STRIDE}} + b] = true
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
    if not EmpNormalConditions or EmpEnded or EmpTick < {{RT.NORMAL_CHECK_GRACE_TICKS}} then
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
endfunction
