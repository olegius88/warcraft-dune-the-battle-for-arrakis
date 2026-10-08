
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
    string array EmpMsgSound
    real array EmpMsgSoundLen
    string array EmpSpeechQ
    real array EmpSpeechQLen
    integer EmpSpeechHead = 0
    integer EmpSpeechTail = 0
    real EmpSpeechLeft = 0.0
    timer EmpSpeechTimer = null
    integer EmpSpeechLastMs = -1
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
    boolean EmpTmpLose = false
    // palace super weapons (helpers.j EmpSwStrike; data from mission superweapon.j)
    hashtable EmpSwTab = null
    group EmpSwFleeGroup = null
    integer EmpSwDeathHand = 0
    // units of each side that fight for another one for a while (berserk, deviated)
    integer array EmpSwBerserk
    // allygain messages (mission.ts): message id -> sub-house k; alliances the mission played
    integer array EmpMsgAlly
    boolean array EmpAllyGain
    boolean array EmpAllyBreak
    // special abilities (mission specials.j)
    hashtable EmpSpTab = null
    group EmpSpLeeched = null
    group EmpSpCrushers = null
    integer EmpSpTicks = 0
    integer EmpSpTicksDone = 0
    integer EmpSpScanned = 0
    group EmpSpCrushNear = null
    unit EmpSpCrusher = null
    // construction yards that gave their builders (battle economy.j)
    group EmpYardsServed = null
    // harvester replacement / cash delivery (battle economy.j): tick the last harvester went, next cash
    integer array EmpHarvGone
    integer array EmpCashNext
    // starport prices (mission starport.j)
    hashtable EmpPortTab = null
    integer array EmpPortPct
    // in-game announcements (helpers.j EmpUiSay; data from mission.ts)
    string array EmpUiText
    string array EmpUiSound
    real array EmpUiLen
    real array EmpUiGap
    integer array EmpUiNext
    hashtable EmpUiTab = InitHashtable()
    // spice mounds (battle spice-fields.j)
    hashtable EmpMoundTab = null
    // sandstorm (battle storm.j)
    hashtable EmpStormTab = null
    group EmpStormSeen = null
    effect EmpStormFx = null
    real EmpStormX = 0.0
    real EmpStormY = 0.0
    real EmpStormTX = 0.0
    real EmpStormTY = 0.0
    integer EmpStormEnd = 0
    integer EmpStormNext = 0
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
    hashtable EmpPowerTab = null
    hashtable EmpCostTab = null
    hashtable EmpWormTab = null
    unit EmpWorm = null
    integer EmpWormEnd = 0
    group array EmpStrike
    integer array EmpStrikeEnd
    unit EmpVetArgUnit = null
    integer EmpVetArgLevel = 0
    boolean array EmpLowPower
    boolean EmpResultSent = false
    timer EmpTimer = null
    timerdialog EmpTimerWindow = null
    item array EmpCrateItem
    integer array EmpCrateGift
    integer array EmpCrateCash
    integer array EmpCrateEnd
    integer EmpCrateCount = 0
    group EmpStealthGroup = null
    integer EmpStealthEnd = 0
    timer EmpCamSpinTimer = null
    real EmpCamSpin = 0.0
    integer EmpCamMoveEnd = 0
    fogmodifier EmpPipFog = null
    timer EmpPipTimer = null
    unit EmpPipUnit = null
    real EmpPipX = 0.0
    real EmpPipY = 0.0
    real EmpPipStoreX = 0.0
    real EmpPipStoreY = 0.0
    integer EmpPipMoveEnd = 0
    boolean EmpPipSpin = false
    boolean array EmpAIIgnore
    hashtable EmpThreat = null
    boolean EmpThreatAny = false
    fogmodifier array EmpShroudMod
    real array EmpShroudX
    real array EmpShroudY
    integer EmpShroudCount = 0
    boolean array EmpWormAttract
    boolean array EmpWormRepel
    integer EmpPlayerHouse = 0
    integer array EmpReinfType
    integer array EmpReinfCost
    integer array EmpReinfTech
    integer array EmpReinfCount
    integer array EmpReinfValue
    integer array EmpReinfAfter
    integer array EmpReinfNext
    boolean array EmpReinfWarned
    timer EmpReinfTimer = null
    integer EmpReinfDelay = 0
    integer EmpReinfVariation = 0
    integer EmpReinfMessage = 0
    integer EmpReinfInitial = 0
    integer EmpReinfSubsequent = 0
    integer array EmpTplType
    integer array EmpTplDx
    integer array EmpTplDy
    integer array EmpTplCount
    unit array EmpTplUnit
    hashtable EmpWaveTab = null
    // enemy AI of territory battles (battle/ai.j)
    hashtable EmpAiTab = null
    integer array EmpAiBType
    integer array EmpAiBCount
    integer array EmpAiWall
    integer array EmpAiPower
    integer array EmpAiRatio
    integer EmpAiPending = 0
    real array EmpAiPendX
    real array EmpAiPendY
    real EmpAiX = 0.0
    real EmpAiY = 0.0
    boolean EmpAiKnown = false
    real EmpAiKnownX = 0.0
    real EmpAiKnownY = 0.0
    real EmpAiStageX = 0.0
    real EmpAiStageY = 0.0
    boolean EmpAiForming = false
    integer EmpAiFormStart = 0
    integer EmpAiCYHit = 0
    integer EmpAiProduced = 0
    integer EmpAiWhy = -1
    integer EmpAiReserve = 0
    integer array EmpAiUpg
    integer array EmpAiUpgB
    integer array EmpAiUpgCost
    real array EmpAiUpgTime
    integer array EmpAiUpgCount
    integer array EmpAiSw
    integer array EmpAiSwPalace
    integer array EmpAiSwTicks
    integer EmpAiSwFrom = -1
    // ai_difficulty.ini by tech level (battle.ts EmpAiData)
    integer array EmpAiTMax
    integer array EmpAiTBuildings
    real array EmpAiTBuildDelay
    real array EmpAiTUnitDelay
    real array EmpAiTGap
    integer array EmpAiTFirst
    integer array EmpAiTMinDef
    integer array EmpAiTMaxDef
    integer array EmpAiTTurrets
    string array EmpAiLogLine
    integer EmpAiLogCount = 0
    integer array EmpPowerSum
