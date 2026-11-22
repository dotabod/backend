-------------------------- MODULE EventSubConduit --------------------------
EXTENDS Naturals

CONSTANTS MaxAttempts, PreserveReconnect
VARIABLES connected, ready, running, attempts, reconnectSeen, reconnectPending

Init ==
  /\ connected = FALSE
  /\ ready = FALSE
  /\ running = FALSE
  /\ attempts = 0
  /\ reconnectSeen = FALSE
  /\ reconnectPending = FALSE

Connect ==
  /\ ~connected
  /\ connected' = TRUE
  /\ IF running
        THEN /\ reconnectSeen' = TRUE
             /\ reconnectPending' = PreserveReconnect
             /\ UNCHANGED <<running, attempts>>
        ELSE /\ running' = ~ready
             /\ attempts' = IF ready THEN attempts ELSE attempts + 1
             /\ UNCHANGED <<reconnectSeen, reconnectPending>>
  /\ UNCHANGED ready

Disconnect ==
  /\ connected
  /\ connected' = FALSE
  /\ reconnectSeen' = FALSE
  /\ UNCHANGED <<ready, running, attempts, reconnectPending>>

Settle(success) ==
  /\ running
  /\ ready' = success
  /\ running' = reconnectPending /\ connected /\ ~success
  /\ attempts' = IF running' THEN attempts + 1 ELSE attempts
  /\ reconnectSeen' = reconnectSeen /\ ~success /\ ~running'
  /\ reconnectPending' = FALSE
  /\ UNCHANGED connected

Next == Connect \/ Disconnect \/ Settle(TRUE) \/ Settle(FALSE)
WithinBound == attempts <= MaxAttempts
NoLostReconnect == ~(connected /\ ~ready /\ ~running /\ reconnectSeen)

=============================================================================
