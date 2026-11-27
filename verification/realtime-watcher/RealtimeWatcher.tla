--------------------------- MODULE RealtimeWatcher ---------------------------
EXTENDS Naturals

CONSTANTS Attempts, Mode
VARIABLES current, retry, removing, removals, retiredBy

vars == <<current, retry, removing, removals, retiredBy>>
Ids == 1..Attempts

Init ==
  /\ current = 1
  /\ retry = FALSE
  /\ removing = FALSE
  /\ removals = [id \in Ids |-> 0]
  /\ retiredBy = 0

ReportFailure(source) ==
  /\ source \in 1..current
  /\ source = current \/ (Mode = "global" /\ ~removing)
  /\ ~retry
  /\ removing' = TRUE
  /\ retry' = (Mode # "reentrant")
  /\ removals' = [removals EXCEPT ![current] = @ + 1]
  /\ retiredBy' = source
  /\ UNCHANGED current

ReturnFromRemoveChannel ==
  /\ removing
  /\ removing' = FALSE
  /\ retry' = TRUE
  /\ UNCHANGED <<current, removals, retiredBy>>

RetryTimerFires ==
  /\ retry
  /\ ~removing
  /\ current < Attempts
  /\ current' = current + 1
  /\ retry' = FALSE
  /\ retiredBy' = 0
  /\ UNCHANGED <<removing, removals>>

Next ==
  \/ \E source \in Ids : ReportFailure(source)
  \/ ReturnFromRemoveChannel
  \/ RetryTimerFires

RemoveEachChannelOnce == \A id \in Ids : removals[id] <= 1
OnlyOwnerMayRetire == retiredBy = 0 \/ retiredBy = current

=============================================================================
