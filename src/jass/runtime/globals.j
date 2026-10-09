
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
    // deployable units: type -> toggle / deployed copy (mission deploy.j)
    hashtable EmpDeployTab = null
    // APC passengers (mission apc.j)
    hashtable EmpApcTab = null
    group EmpApcAll = null
    // units that blow themselves up (mission detonate.j)
    hashtable EmpBoomTab = null
    boolean EmpBoomMines = false
    // dust scouts burrowed (mission burrow.j)
    hashtable EmpBurrowTab = null
    // worm calls and riders (mission wormride.j)
    hashtable EmpRideTab = null
    // NIAB teleports (mission teleport.j)
    hashtable EmpTeleTab = null
    // projector replicas (mission projector.j)
    hashtable EmpProjTab = null
    group EmpProjAll = null
    group EmpRideAll = null
    // carryalls at work, their harvesters, a destination (battle carryall.j)
    hashtable EmpCarryTab = null
    group EmpCarryBusy = null
    group EmpCarryAdv = null
    real EmpCarryX = 0.0
    real EmpCarryY = 0.0
    unit EmpAiCarryHangar = null
    // reserve stacks joining this battle (hub EmpGo -> mission campaign.j; battle forces.j)
    integer EmpReserveStacks = 0
    // ornithopters' rounds, pads (battle orni.j)
    hashtable EmpOrniTab = null
    group EmpOrniAll = null
    unit EmpDeployArgUnit = null
    boolean EmpDeployArgOn = false
    boolean EmpDeployAutoAny = false
    // the defending AI got a kept base with a construction yard (battle forces.j EmpBaseRestore)
    boolean EmpBaseRestored = false
    // the row battle explored.j saves / restores in its own thread
    integer EmpExploreRow = 0
    // attack damage by warhead (mission damage.j)
    hashtable EmpDmgTab = null
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
    // ticks left to the next replacement harvester (battle economy.j EmpHarvReplaceTick)
    integer array EmpHarvLeft
    integer array EmpCashNext
    // starport prices (mission starport.j)
    hashtable EmpPortTab = null
    hashtable EmpFxTab = null
    integer array EmpPortPct
    // starport stock (mission starport.j): [player * types + type index] stock and units in the cart
    // (ordered, not landed yet); per player the whole cart and the seconds to the next stock increase
    integer array EmpPortStock
    integer array EmpPortCart
    integer array EmpPortCartAll
    real array EmpPortStockLeft
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
    // sandstorm pick-up chance per check by StormDamage class 1..3 (battle storm.j)
    real array EmpStormPick
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
    // veteran type (ExtraRange) -> its Emperor type at child 0 (EmpType, mission veterancy.j)
    hashtable EmpVetBase = null
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
    // the AI's construction yard and the yard type of every house (battle forces.j, ai.j EmpAiYardAlive)
    unit EmpAiYard = null
    integer array EmpAiYardType
    hashtable EmpWaveTab = null
    // enemy AI of territory battles (battle/ai.j)
    hashtable EmpAiTab = null
    integer array EmpAiBType
    integer array EmpAiBCount
    integer array EmpAiWall
    integer array EmpAiPower
    // refinery pads (battle pads.j); the AI's pad order per house, its cost and time, one at a time
    hashtable EmpPadTab = null
    integer array EmpAiPadType
    integer array EmpAiPadCost
    real array EmpAiPadTime
    boolean EmpAiPadBusy = false
    // the AI's map of tiles and its defence plan (battle ai-map.j)
    hashtable EmpAiMapTab = null
    integer EmpAiMapW = 0
    integer EmpAiMapH = 0
    real EmpAiMapAx = 0.0
    real EmpAiMapAy = 0.0
    unit EmpAiMapUnit = null
    integer EmpAiBbX0 = 0
    integer EmpAiBbY0 = 0
    integer EmpAiBbX1 = 0
    integer EmpAiBbY1 = 0
    integer EmpAiRsX = 0
    integer EmpAiRsY = 0
    integer EmpAiClN = 0
    integer array EmpAiClX0
    integer array EmpAiClY0
    integer array EmpAiClX1
    integer array EmpAiClY1
    boolean array EmpAiClMade
    boolean array EmpAiClDone
    integer array EmpAiTrX
    integer array EmpAiTrY
    integer EmpAiTrN = 0
    integer EmpAiTrX0 = 0
    integer EmpAiTrY0 = 0
    integer EmpAiTrX1 = 0
    integer EmpAiTrY1 = 0
    integer EmpAiTrPh = 0
    integer EmpAiTrCx = 0
    integer EmpAiTrCy = 0
    integer EmpAiTrSx = 0
    integer EmpAiTrSy = 0
    integer EmpAiTrHit = 0
    integer EmpAiPlanC = 0
    integer array EmpAiPlanTurret
    integer EmpAiWallSince = 0
    boolean EmpAiWalling = false
    integer EmpAiPersonality = 0
    // building sites (battle ai-map.j EmpAiPlace)
    integer EmpAiRdDir = -1
    integer EmpAiSiteX = 0
    integer EmpAiSiteY = 0
    integer EmpAiSiteLen = 0
    integer EmpAiPlaceT = 0
    integer EmpAiEvT = 0
    integer EmpAiEvC = 0
    integer EmpAiEvPx = 0
    integer EmpAiEvPy = 0
    integer EmpAiEvX = 0
    integer EmpAiEvY = 0
    integer EmpAiEvN = 0
    real EmpAiEvBest = 0.0
    integer EmpAiEvBx = -1
    integer EmpAiEvBy = -1
    boolean EmpAiPlaceOk = false
    integer EmpAiRoomEpoch = 1
    // tactics started (battle ai.j EmpAiTactics)
    boolean EmpAiGuardHarv = false
    boolean EmpAiGuardCY = false
    real EmpAiPtX = 0.0
    real EmpAiPtY = 0.0
    trigger EmpAiMapLostTrig = null
    integer EmpAiIntrusionAt = 0
    integer EmpAiIntrusionN = 0
    integer array EmpAiIntrusionX
    integer array EmpAiIntrusionY
    // the builder's critical needs (ai.j EmpAiCritical): refinery and helipad type per house
    integer array EmpAiRefinery
    integer array EmpAiHelipad
    integer array EmpAiRatio
    integer EmpAiPending = 0
    real array EmpAiPendX
    real array EmpAiPendY
    real EmpAiX = 0.0
    real EmpAiY = 0.0
    boolean EmpAiKnown = false
    real EmpAiKnownX = 0.0
    real EmpAiKnownY = 0.0
    // the AI's MCV looking for room (ai.j EmpAiMcvTick): the MCV, the ring searched, the point found
    unit EmpAiMcvUnit = null
    integer EmpAiMcvRing = 0
    boolean EmpAiMcvFound = false
    real EmpAiMcvX = 0.0
    real EmpAiMcvY = 0.0
    integer EmpAiProduced = 0
    integer EmpAiWhy = -1
    // the AI's shares of its credits for units / buildings (battle ai.j EmpAiShares)
    integer EmpAiUnitPct = 0
    integer EmpAiBuildPct = 100
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
    // the same in ticks (BuildingDelay, GapBetweenNewScripts) and the ai.ini values SideAIBehaviour*
    // re-tunes (battle forces.j EmpAiBehave); EmpAiOn: the AI runs side 1 (ai.j EmpAiInit)
    integer array EmpAiTBuildTicks
    integer array EmpAiTGapTicks
    integer array EmpAiTMaintTicks
    real array EmpAiTMaintDelay
    boolean EmpAiMaintaining = false
    // ai.ini [StartScript] (battle ai.j EmpAiStartStep): categories, steps, done, a step's waits;
    // EmpAiStartState 0 not decided, 1 running, 2 over
    integer array EmpAiStartCat
    integer EmpAiStartCount = 0
    integer EmpAiStartAt = 0
    integer EmpAiStartWait = 0
    integer EmpAiStartState = 0
    integer EmpAiDefPct = 0
    integer EmpAiWander = 0
    boolean EmpAiBuildsDef = false
    integer EmpAiScoutTeams = 0
    boolean EmpAiOn = false
    integer EmpAiBehaveMode = 0
    // the AI skill (Game.exe +0x400, battle forces.j EmpAiTune) and the side's difficulty it starts from
    integer EmpAiSkill = {{AI_SKILL.none}}
    integer EmpAiSkillBase = 0
    integer EmpAiStrength = 0
    // defensive assembly points by base point (index b * 3 + k, mission.ts), reserve team members and
    // the tick of each team's last fight (battle ai.j EmpAiResTeam / EmpAiTactics)
    real array EmpAiDefX
    real array EmpAiDefY
    integer array EmpAiResN
    integer array EmpAiResFight
    // the harvester of side 1 hit lately, by whom, when (battle ai.j EmpAiHarvTick)
    unit EmpAiHarvHit = null
    unit EmpAiHarvHitBy = null
    integer EmpAiHarvHitAt = 0
    trigger EmpAiHarvHitTrig = null
    // the losing test (battle ai.j EmpAiLosingCheck): MCV type and price, done once, the AI retreated
    integer EmpAiMcv = 0
    integer EmpAiMcvCost = 0
    boolean EmpAiLost = false
    boolean EmpAiGone = false
    timer EmpAiWaveTimer = null
    // AI script tactics (battle ai-scripts.j)
    integer array EmpScrD
    integer array EmpScrOff
    integer EmpScrN = 0
    integer EmpScrTop = 0
    string EmpScrStr = ""
    hashtable EmpScrSetTab = null
    hashtable EmpScrTab = null
    group EmpScrPool = null
    group EmpScrUnits = null
    real EmpScrPtX = 0.0
    real EmpScrPtY = 0.0
    boolean array EmpScrSlotOn
    integer array EmpScrSlotScript
    integer array EmpScrSlotStep
    integer array EmpScrSlotStepAt
    integer array EmpScrSlotStart
    integer array EmpScrSlotUnits
    integer array EmpAiTScripts
    unit EmpAiThreat = null
    timer EmpAiBuildTimer = null
    string array EmpAiLogLine
    integer EmpAiLogCount = 0
    integer array EmpPowerSum
