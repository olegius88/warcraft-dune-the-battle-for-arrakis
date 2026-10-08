
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
    if EmpAlive(u) and (EmpTmpType == 0 or (EmpTmpType == 1 and not IsUnitType(u, UNIT_TYPE_STRUCTURE)) or (EmpTmpType == 2 and IsUnitType(u, UNIT_TYPE_STRUCTURE)) or GetUnitTypeId(u) == EmpTmpType) and not (EmpTmpLose and LoadBoolean(EmpVet, GetUnitTypeId(u), 4)) then
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

// EmpCount for the normal win/lose rule: Rules.txt ExcludeFromCampaignLose objects (walls, small
// windtraps; EmpVet child 4) do not keep a side alive (test/emperor-mission.test.ts)
function EmpLoseCount takes integer side, integer kind returns integer
    local integer n
    set EmpTmpLose = true
    set n = EmpCount(side, kind)
    set EmpTmpLose = false
    return n
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

// ---- crates (Emperor: a unit driving over a crate gets its gift). WC3 items need an inventory,
// which Emperor units do not have, so the pickup is a proximity check (EmpCrateTick, mission part).
// gift > 0: unit type; gift == 0: cash credits; gift < 0: special crate (config CRATE_KIND).
function EmpAddCrate takes real x, real y, integer gift, integer cash returns nothing
    set EmpCrateItem[EmpCrateCount] = CreateItem('{{ITEM.crate}}', x, y)
    call SetItemInvulnerable(EmpCrateItem[EmpCrateCount], true)
    set EmpCrateGift[EmpCrateCount] = gift
    set EmpCrateCash[EmpCrateCount] = cash
    set EmpCrateEnd[EmpCrateCount] = 0
    set EmpCrateCount = EmpCrateCount + 1
endfunction

// a crate dropped by a script (NewCrate*): it disappears after Rules.txt [Crate] Lifespan
function EmpScriptCrate takes location l, integer gift, integer cash returns nothing
    if l == null then
        return
    endif
    call EmpAddCrate(GetLocationX(l), GetLocationY(l), gift, cash)
    set EmpCrateEnd[EmpCrateCount - 1] = EmpTick + {{RT.CRATE_LIFESPAN_TICKS}}
endfunction

// damage every unit and building in radius r around (x, y); a unit left with no life dies
function EmpDamageArea takes real x, real y, real r, real dmg returns nothing
    local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and u != EmpWorm then
            if GetWidgetLife(u) <= dmg then
                call KillUnit(u)
            else
                call SetWidgetLife(u, GetWidgetLife(u) - dmg)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// ---- palace super weapons (src/emperor/superweapons.ts, Rules.txt): EmpSwTab[charge type]:
// 0 kind (1 Death Hand, 2 Hawk, 3 Chaos Lightning), 1 damage, 2 radius, 3 friendly fire, 4 seconds a
// hit unit flees / is berserk; fallout 5 damage per second, 6 radius, 7 seconds, 8 friendly fire.
// Handle keys: 20 flee until (tick), 21/22 flee from x/y, 23 berserk owner (player id + 1).
function EmpSwType takes integer t, integer kind, real dmg, real r, boolean friendly, real effect returns nothing
    call SaveInteger(EmpSwTab, t, 0, kind)
    call SaveReal(EmpSwTab, t, 1, dmg)
    call SaveReal(EmpSwTab, t, 2, r)
    call SaveBoolean(EmpSwTab, t, 3, friendly)
    call SaveReal(EmpSwTab, t, 4, effect)
endfunction

function EmpSwFallout takes integer t, real dps, real r, real seconds, boolean friendly returns nothing
    call SaveReal(EmpSwTab, t, 5, dps)
    call SaveReal(EmpSwTab, t, 6, r)
    call SaveReal(EmpSwTab, t, 7, seconds)
    call SaveBoolean(EmpSwTab, t, 8, friendly)
endfunction

// damage within r of (x, y); without friendly fire who's allies are spared
function EmpSwDamage takes player who, real x, real y, real r, real dmg, boolean friendly returns nothing
    local group g = CreateGroup()
    local unit u
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and u != EmpWorm and (friendly or not IsUnitAlly(u, who)) then
            if GetWidgetLife(u) <= dmg then
                call KillUnit(u)
            else
                call SetWidgetLife(u, GetWidgetLife(u) - dmg)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// radioactive fallout of the Death Hand: damage every second for its Lifespan
// TODO(superweapon): how often the DeathHandSplat_B damage applies is not in Rules.txt; once a
// second is assumed (per tick would be 25 times as much). Warhead percentages (Death_W,
// DeathHandSplat_W) are not applied: the damage is the same for every armour.
function EmpSwFalloutTick takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local integer h = GetHandleId(tm)
    local integer t = LoadInteger(EmpSwTab, h, 0)
    local integer left = LoadInteger(EmpSwTab, h, 3) - 1
    call EmpSwDamage(Player(LoadInteger(EmpSwTab, h, 4)), LoadReal(EmpSwTab, h, 1), LoadReal(EmpSwTab, h, 2), LoadReal(EmpSwTab, t, 6), LoadReal(EmpSwTab, t, 5), LoadBoolean(EmpSwTab, t, 8))
    if left <= 0 then
        call DestroyEffect(LoadEffectHandle(EmpSwTab, h, 5))
        call FlushChildHashtable(EmpSwTab, h)
        call DestroyTimer(tm)
    else
        call SaveInteger(EmpSwTab, h, 3, left)
    endif
    set tm = null
endfunction

// Hawk Strike: hit enemy units flee from the strike point, out of their owner's control
function EmpSwFleeTick takes nothing returns nothing
    local group g = CreateGroup()
    local unit u
    local integer h
    local real a
    call GroupAddGroup(EmpSwFleeGroup, g)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        set h = GetHandleId(u)
        if not EmpAlive(u) or EmpTick >= LoadInteger(EmpSwTab, h, 20) then
            call GroupRemoveUnit(EmpSwFleeGroup, u)
            call RemoveSavedInteger(EmpSwTab, h, 20)
            if EmpAlive(u) then
                call IssueImmediateOrder(u, "stop")
            endif
        else
            set a = Atan2(GetUnitY(u) - LoadReal(EmpSwTab, h, 22), GetUnitX(u) - LoadReal(EmpSwTab, h, 21))
            call IssuePointOrder(u, "move", GetUnitX(u) + {{real RT.SW_FLEE_STEP}} * Cos(a), GetUnitY(u) + {{real RT.SW_FLEE_STEP}} * Sin(a))
        endif
    endloop
    call DestroyGroup(g)
    set g = null
endfunction

// Chaos Lightning: a berserk unit is back with its owner when the effect wears off
function EmpSwCalm takes nothing returns nothing
    local timer tm = GetExpiredTimer()
    local unit u = LoadUnitHandle(EmpSwTab, GetHandleId(tm), 0)
    // the side is kept with the timer: a unit removed meanwhile still gives its count back
    local integer p = LoadInteger(EmpSwTab, GetHandleId(tm), 1)
    if u != null and p > 0 and EmpAlive(u) then
        call SetUnitOwner(u, Player(p - 1), true)
    endif
    if p > 0 then
        set EmpSwBerserk[p - 1] = EmpSwBerserk[p - 1] - 1
    endif
    if u != null then
        call RemoveSavedInteger(EmpSwTab, GetHandleId(u), 23)
    endif
    call FlushChildHashtable(EmpSwTab, GetHandleId(tm))
    call DestroyTimer(tm)
    set tm = null
    set u = null
endfunction

// flee (Hawk) or berserk (Chaos Lightning) for the enemy units of who within r
function EmpSwAffect takes player who, real x, real y, real r, integer kind, real seconds returns nothing
    local group g = CreateGroup()
    local unit u
    local timer tm
    call GroupEnumUnitsInRange(g, x, y, r, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and u != EmpWorm and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and not IsUnitAlly(u, who) and GetOwningPlayer(u) != Player(PLAYER_NEUTRAL_AGGRESSIVE) then
            if kind == 2 then
                call SaveInteger(EmpSwTab, GetHandleId(u), 20, EmpTick + R2I(seconds * {{TPS}}))
                call SaveReal(EmpSwTab, GetHandleId(u), 21, x)
                call SaveReal(EmpSwTab, GetHandleId(u), 22, y)
                call GroupAddUnit(EmpSwFleeGroup, u)
            elseif kind == 3 and not HaveSavedInteger(EmpSwTab, GetHandleId(u), 23) then
                // owned by Neutral Hostile the unit fires on everyone nearby, its old side included
                call SaveInteger(EmpSwTab, GetHandleId(u), 23, GetPlayerId(GetOwningPlayer(u)) + 1)
                // still the side's unit for the win / lose rule (EmpNormalCheck)
                set EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] = EmpSwBerserk[GetPlayerId(GetOwningPlayer(u))] + 1
                call SetUnitOwner(u, Player(PLAYER_NEUTRAL_AGGRESSIVE), false)
                set tm = CreateTimer()
                call SaveUnitHandle(EmpSwTab, GetHandleId(tm), 0, u)
                call SaveInteger(EmpSwTab, GetHandleId(tm), 1, LoadInteger(EmpSwTab, GetHandleId(u), 23))
                call TimerStart(tm, seconds, false, function EmpSwCalm)
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    set tm = null
endfunction

// strike of the charge type t for who at (x, y)
function EmpSwStrike takes integer t, player who, real x, real y returns nothing
    local integer kind = LoadInteger(EmpSwTab, t, 0)
    local timer tm
    local integer h
    if EmpSwFleeGroup == null then
        set EmpSwFleeGroup = CreateGroup()
        call TimerStart(CreateTimer(), {{real RT.SW_FLEE_PERIOD}}, true, function EmpSwFleeTick)
    endif
    call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.nuke.id}}', {{ART_ABILITY.nuke.type}}, 0), x, y))
    call EmpSwDamage(who, x, y, LoadReal(EmpSwTab, t, 2), LoadReal(EmpSwTab, t, 1), LoadBoolean(EmpSwTab, t, 3))
    if kind == 2 or kind == 3 then
        call EmpSwAffect(who, x, y, LoadReal(EmpSwTab, t, 2), kind, LoadReal(EmpSwTab, t, 4))
    endif
    if LoadReal(EmpSwTab, t, 7) > 0.0 then
        set tm = CreateTimer()
        set h = GetHandleId(tm)
        call SaveInteger(EmpSwTab, h, 0, t)
        call SaveReal(EmpSwTab, h, 1, x)
        call SaveReal(EmpSwTab, h, 2, y)
        call SaveInteger(EmpSwTab, h, 3, R2I(LoadReal(EmpSwTab, t, 7)))
        call SaveInteger(EmpSwTab, h, 4, GetPlayerId(who))
        call SaveEffectHandle(EmpSwTab, h, 5, AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.fallout.id}}', {{ART_ABILITY.fallout.type}}, 0), x, y))
        call TimerStart(tm, 1.0, true, function EmpSwFalloutTick)
    endif
    set tm = null
endfunction

// super weapon strike of the scripts (SideNuke, SideNukeAll, FireSpecialWeapon): the Death Hand
function EmpNukeAt takes real x, real y returns nothing
    if EmpSwDeathHand != 0 then
        call EmpSwStrike(EmpSwDeathHand, Player(PLAYER_NEUTRAL_AGGRESSIVE), x, y)
    endif
endfunction

// stealth crate: the taker's units around it turn invisible for CRATE_STEALTH_SECONDS. The
// invisibility ability code is not in common.ai, so a failed UnitAddAbility falls back to a
// see-through look (visual only).
function EmpStealthAround takes unit taker returns nothing
    local group g = CreateGroup()
    local unit u
    if EmpStealthGroup == null then
        set EmpStealthGroup = CreateGroup()
    endif
    call GroupEnumUnitsInRange(g, GetUnitX(taker), GetUnitY(taker), {{real RT.CRATE_STEALTH_RADIUS}}, null)
    loop
        set u = FirstOfGroup(g)
        exitwhen u == null
        call GroupRemoveUnit(g, u)
        if EmpAlive(u) and GetOwningPlayer(u) == GetOwningPlayer(taker) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) then
            if not UnitAddAbility(u, '{{ABILITY.invisibility}}') then
                call SetUnitVertexColor(u, 255, 255, 255, {{RT.STEALTH_ALPHA}})
            endif
            call GroupAddUnit(EmpStealthGroup, u)
        endif
    endloop
    call DestroyEffect(AddSpecialEffect(GetAbilityEffectById('{{ART_ABILITY.stealth.id}}', {{ART_ABILITY.stealth.type}}, 0), GetUnitX(taker), GetUnitY(taker)))
    set EmpStealthEnd = EmpTick + R2I({{real RT.CRATE_STEALTH_SECONDS}} * {{TPS}})
    call DestroyGroup(g)
    set g = null
endfunction

// end of a stealth crate's effect (called by the crate tick)
function EmpStealthExpire takes nothing returns nothing
    local unit u
    if EmpStealthGroup == null or EmpTick < EmpStealthEnd then
        return
    endif
    loop
        set u = FirstOfGroup(EmpStealthGroup)
        exitwhen u == null
        call GroupRemoveUnit(EmpStealthGroup, u)
        call UnitRemoveAbility(u, '{{ABILITY.invisibility}}')
        call SetUnitVertexColor(u, 255, 255, 255, 255)
    endloop
endfunction

// ---- PIP: Emperor's picture-in-picture view of a point or object. WC3 has no second viewport, so
// the PIP target is revealed for the player (PIP_REVEAL_RADIUS) and pinged on the minimap.
function EmpPipShow takes real x, real y, boolean ping returns nothing
    if EmpPipFog != null then
        call DestroyFogModifier(EmpPipFog)
    endif
    set EmpPipX = x
    set EmpPipY = y
    set EmpPipFog = CreateFogModifierRadius(Player(0), FOG_OF_WAR_VISIBLE, x, y, {{real RT.PIP_REVEAL_RADIUS}}, true, false)
    call FogModifierStart(EmpPipFog)
    if ping then
        call PingMinimap(x, y, {{real RT.PIP_PING_SECONDS}})
    endif
endfunction

function EmpPipTick takes nothing returns nothing
    if EmpAlive(EmpPipUnit) then
        call EmpPipShow(GetUnitX(EmpPipUnit), GetUnitY(EmpPipUnit), false)
    endif
endfunction

function EmpPipFollow takes unit u returns nothing
    set EmpPipUnit = u
    if EmpPipTimer == null then
        set EmpPipTimer = CreateTimer()
        call TimerStart(EmpPipTimer, {{real RT.PIP_UPDATE}}, true, function EmpPipTick)
    endif
    if EmpAlive(u) then
        call EmpPipShow(GetUnitX(u), GetUnitY(u), true)
    endif
endfunction

// ---- main camera spin (CameraStartRotate)
function EmpCamSpinTick takes nothing returns nothing
    call SetCameraFieldForPlayer(Player(0), CAMERA_FIELD_ROTATION, GetCameraField(CAMERA_FIELD_ROTATION) * bj_RADTODEG + EmpCamSpin * {{real RT.CAMERA_SPIN_PERIOD}}, {{real RT.CAMERA_SPIN_PERIOD}})
endfunction

// ---- AI target choice by threat (SetThreatLevel): the most threatening object type near u
function EmpThreatTarget takes unit u returns unit
    local group g
    local unit v
    local unit best = null
    local integer bt = 0
    local integer t
    if not EmpThreatAny then
        return null
    endif
    set g = CreateGroup()
    call GroupEnumUnitsInRange(g, GetUnitX(u), GetUnitY(u), {{real RT.AI_THREAT_RADIUS}}, null)
    loop
        set v = FirstOfGroup(g)
        exitwhen v == null
        call GroupRemoveUnit(g, v)
        if EmpAlive(v) and GetOwningPlayer(v) != GetOwningPlayer(u) and not IsUnitAlly(v, GetOwningPlayer(u)) then
            set t = LoadInteger(EmpThreat, GetUnitTypeId(v), 0)
            if t > bt then
                set bt = t
                set best = v
            endif
        endif
    endloop
    call DestroyGroup(g)
    set g = null
    return best
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

// In-game announcement e (config UI_EVENTS): the original line of the player's house, shown and
// spoken, at most once per EmpUiGap[e] seconds (data: mission.ts EmpData)
function EmpUiSay takes integer e returns nothing
    if EmpUiText[e] == null or EmpTick < EmpUiNext[e] then
        return
    endif
    set EmpUiNext[e] = EmpTick + R2I(EmpUiGap[e] * {{TPS}})
    call EmpShow(EmpUiText[e])
    call EmpSpeak(EmpUiSound[e], EmpUiLen[e])
endfunction

// the player's units attacked: the base, a harvester
function EmpUiAttacked takes nothing returns nothing
    local unit u = GetTriggerUnit()
    if IsUnitType(u, UNIT_TYPE_STRUCTURE) then
        call EmpUiSay({{UI.baseAttack}})
    elseif LoadBoolean(EmpUiTab, GetUnitTypeId(u), 0) then
        call EmpUiSay({{UI.harvAttack}})
    endif
    set u = null
endfunction

// the player's units lost
function EmpUiDeath takes nothing returns nothing
    if IsUnitType(GetTriggerUnit(), UNIT_TYPE_STRUCTURE) then
        call EmpUiSay({{UI.bldgLost}})
    else
        call EmpUiSay({{UI.unitLost}})
    endif
endfunction

// a unit trained (a super weapon charge: ready to fire), building started / finished, research
function EmpUiTrained takes nothing returns nothing
    if HaveSavedInteger(EmpSwTab, GetUnitTypeId(GetTrainedUnit()), 0) then
        call EmpUiSay({{UI.specWepReady}})
    else
        call EmpUiSay({{UI.unitReady}})
    endif
endfunction

function EmpUiBuildStart takes nothing returns nothing
    call EmpUiSay({{UI.bldgStart}})
endfunction

function EmpUiBuildDone takes nothing returns nothing
    call EmpUiSay({{UI.conComplete}})
endfunction

function EmpUiResearch takes nothing returns nothing
    call EmpUiSay({{UI.upgrade}})
endfunction

function EmpUiInit takes nothing returns nothing
    local trigger tr
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_ATTACKED, null)
    call TriggerAddAction(tr, function EmpUiAttacked)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_DEATH, null)
    call TriggerAddAction(tr, function EmpUiDeath)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_TRAIN_FINISH, null)
    call TriggerAddAction(tr, function EmpUiTrained)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_CONSTRUCT_START, null)
    call TriggerAddAction(tr, function EmpUiBuildStart)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_CONSTRUCT_FINISH, null)
    call TriggerAddAction(tr, function EmpUiBuildDone)
    set tr = CreateTrigger()
    call TriggerRegisterPlayerUnitEvent(tr, Player(0), EVENT_PLAYER_UNIT_RESEARCH_START, null)
    call TriggerAddAction(tr, function EmpUiResearch)
    set tr = null
endfunction

// ---- side AI (simple order-based behaviour) ----
// modes: 0 none, 1 aggressive (attack nearest enemy base), 2 move to point, 3 exit map,
//        4 guard object, 5 attack object, 6 headless chicken, 7 stop, 8 normal (stay near own base)
// EmpAIIgnore[side] (SideAIEncounterIgnore): moving units do not fight on the way.
// Units that may fight first attack the most threatening object type nearby (SetThreatLevel).
function EmpAIOrderEnum takes nothing returns boolean
    local unit u = GetFilterUnit()
    local integer side = EmpTmpSide
    local integer m = EmpAIMode[side]
    local integer b
    local unit th = null
    local string mv = "attack"
    if EmpAIIgnore[side] then
        set mv = "move"
    endif
    if EmpAlive(u) and not IsUnitType(u, UNIT_TYPE_STRUCTURE) and GetUnitCurrentOrder(u) == 0 then
        if (m == 1 or m == 8 or (m == 2 and not EmpAIIgnore[side])) then
            set th = EmpThreatTarget(u)
        endif
        if th != null then
            call IssueTargetOrder(u, "attack", th)
        elseif m == 1 then
            set b = EmpBaseOfSide(EmpAITargetSide[side])
            call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
        elseif m == 8 then
            set b = EmpBaseOfSide(side)
            // units of an all-out attack wave (battle forces.j EmpEnemyWave) fight where they are
            // scouts, escorts and wave units (battle ai.j roles, EmpWaveTab child 1) have their own orders
            if not IsUnitInRangeXY(u, EmpBaseX[b], EmpBaseY[b], {{real RT.AI_HOME_RADIUS}}) and not (EmpWaveTab != null and (LoadBoolean(EmpWaveTab, GetHandleId(u), 0) or LoadInteger(EmpWaveTab, GetHandleId(u), 1) != 0)) then
                call IssuePointOrder(u, "attack", EmpBaseX[b], EmpBaseY[b])
            endif
        elseif m == 2 and EmpAITarget[side] != null then
            call IssuePointOrderLoc(u, mv, EmpAITarget[side])
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
    set th = null
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
    // the attacker's last shot (StealthedWhenStill units show themselves while firing)
    if EmpVetUnit != null then
        call SaveInteger(EmpVetUnit, GetHandleId(GetAttacker()), 9, EmpTick)
    endif
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
// Berserk units (Chaos Lightning, EmpSwAffect) belong to Neutral Hostile for a while but still count
// for their side (EmpSwBerserk): a side whose last units went berserk was beaten before.
function EmpNormalCheck takes nothing returns nothing
    if not EmpNormalConditions or EmpEnded or EmpTick < {{RT.NORMAL_CHECK_GRACE_TICKS}} then
        return
    endif
    if EmpDefendMode then
        // defence: all attack waves have arrived and none of the attackers is left
        if EmpWavesLeft == 0 and EmpLoseCount(1, 0) == 0 and EmpSwBerserk[1] == 0 then
            call EmpEnd(true)
        elseif EmpLoseCount(0, 2) == 0 then
            call EmpEnd(false)
        endif
    elseif EmpLoseCount(1, 2) == 0 and EmpLoseCount(1, 1) == 0 and EmpSwBerserk[1] == 0 then
        call EmpEnd(true)
    elseif EmpLoseCount(0, 0) == 0 and EmpSwBerserk[0] == 0 then
        call EmpEnd(false)
    endif
endfunction

// ---- reinforcements (Rules.txt [General] UnitValue*Reinforcements, TicksBetweenReinforcements):
// every set brings random units of the side's house (ReinforcementValue <= what is left of the set's
// value, TechLevel <= the current tech level) to the side's entrance. Sides 0 (player) and 1 (main
// enemy) have a house; the pick table is filled by the mission (EmpReinfData).
function EmpReinfHouse takes integer side returns integer
    if side == 0 then
        return EmpPlayerHouse
    elseif side == 1 then
        return EmpEnemyHouse
    endif
    return -1
endfunction

// a set of random units of the side's house worth `value` (sum of ReinforcementValue; TechLevel <=
// the current tech level) around (x, y); also the starting armies of territory battles
function EmpSpawnSet takes integer side, integer value, real x, real y, real spread returns nothing
    local integer h = EmpReinfHouse(side)
    local integer left = value
    local integer tries = 0
    local integer k
    local unit u
    if h < 0 or EmpReinfCount[h] == 0 then
        return
    endif
    loop
        exitwhen left <= 0 or tries > {{RT.REINF_PICK_TRIES}}
        set k = h * {{RT.REINF_SLOT_STRIDE}} + GetRandomInt(0, EmpReinfCount[h] - 1)
        if EmpReinfCost[k] <= left and EmpReinfTech[k] <= EmpTechLevel then
            set u = CreateUnit(EmpSidePlayer(side), EmpReinfType[k], x + GetRandomReal(-spread, spread), y + GetRandomReal(-spread, spread), {{FACING}})
            set left = left - EmpReinfCost[k]
        endif
        set tries = tries + 1
    endloop
    set u = null
endfunction

function EmpReinfArrive takes integer side returns nothing
    local integer e = EmpEntranceFor(side)
    call EmpSpawnSet(side, EmpReinfValue[side], EmpEntrX[e], EmpEntrY[e], {{real RT.REINF_SPREAD}})
    if side == 0 then
        call EmpUiSay({{UI.reinforceArr}})
        call PingMinimap(EmpEntrX[e], EmpEntrY[e], {{real RT.REINF_PING_SECONDS}})
    endif
endfunction

function EmpReinfSchedule takes integer side returns nothing
    set EmpReinfNext[side] = EmpTick + EmpReinfDelay + GetRandomInt(-EmpReinfVariation, EmpReinfVariation)
    set EmpReinfWarned[side] = false
endfunction

function EmpReinfTick takes nothing returns nothing
    local integer side = 0
    loop
        exitwhen side > {{RT.MAX_SIDE}}
        if EmpReinfValue[side] > 0 and EmpReinfNext[side] > 0 then
            if side == 0 and not EmpReinfWarned[0] and EmpTick >= EmpReinfNext[0] - EmpReinfMessage then
                set EmpReinfWarned[0] = true
                call EmpUiSay({{UI.reinforceApp}})
            endif
            if EmpTick >= EmpReinfNext[side] then
                call EmpReinfArrive(side)
                set EmpReinfValue[side] = EmpReinfAfter[side]
                call EmpReinfSchedule(side)
            endif
        endif
        set side = side + 1
    endloop
endfunction

// side gets reinforcement sets: the first of value first, then of value later each
function EmpReinfStart takes integer side, integer first, integer later returns nothing
    if side < 0 or side > {{RT.MAX_SIDE}} then
        return
    endif
    set EmpReinfValue[side] = first
    set EmpReinfAfter[side] = later
    if EmpReinfNext[side] == 0 then
        call EmpReinfSchedule(side)
    endif
    if EmpReinfTimer == null then
        set EmpReinfTimer = CreateTimer()
        call TimerStart(EmpReinfTimer, {{real RT.REINF_TICK}}, true, function EmpReinfTick)
    endif
endfunction
