# Permissions + Event Contracts

## Permission Resolution
1. Base @everyone permissions
2. Add role permissions
3. Apply channel role denies/allows
4. Apply member denies/allows
5. ADMINISTRATOR short-circuit

## Gateway Events (v1)
- MESSAGE_CREATED
- MESSAGE_EDITED
- MESSAGE_DELETED
- PRESENCE_UPDATED
- MEMBER_UPDATED

All message payloads are encrypted envelopes.
