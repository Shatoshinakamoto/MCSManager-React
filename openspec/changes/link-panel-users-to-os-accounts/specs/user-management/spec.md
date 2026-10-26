# Spec Delta

## ADDED Requirements

### Requirement: OS Account Mapping

The panel SHALL let each user record carry an optional host OS account name (`osAccount`, empty by default). Records persisted before this field existed SHALL load with it empty.

Only a caller whose own permission is Web Admin (20) SHALL be able to set or change it, whether or not Web Admin enforcement is on. A value sent by anyone else SHALL be ignored and logged.

A non-empty value SHALL be either:
- a POSIX account name (`[A-Za-z_][A-Za-z0-9_-]{0,31}`), or
- a Windows account name, optionally prefixed by a domain (`DOMAIN\name`), without control characters, shell or path metacharacters, leading or trailing spaces, or a leading dash.

All-digit values SHALL be rejected. The panel SHALL NOT accept numeric uid/gid values for this field.

The value SHALL be shown in the administrative user list and search results. Self-service profile updates SHALL NOT change it.

#### Scenario: Existing records load unmapped
- **WHEN** the panel loads a user record written before the field existed
- **THEN** the user's `osAccount` is empty and the user behaves exactly as before

#### Scenario: Only a Web Admin can set the mapping
- **WHEN** a caller with permission below 20 submits an administrative edit containing `osAccount`
- **THEN** the field is ignored, a warning is logged, and the stored mapping is unchanged

#### Scenario: Numeric and unsafe names are rejected
- **WHEN** a Web Admin submits `osAccount` values such as `1000`, `-x`, `a;b`, `a b ` or `$(id)`
- **THEN** the edit is rejected and nothing is stored

### Requirement: Coordinated OS Account Binding Edits

Some administrative operations change the set of OS accounts holding an instance:
- a user's `osAccount`;
- a user's instance assignments;
- user deletion;
- an exchange purchase for an existing mapped user.

For any such operation, the panel SHALL do the following:
1. Derive the affected `(daemonId, instanceUuid)` pairs from the stored records. A pair is affected when its list of distinct non-empty `osAccount` values among assigned users changes.
2. Ask each affected daemon to check the new list for each pair.
3. Ask each affected daemon to apply the new list for each pair.
4. Persist the panel change only after every check and apply succeeded.

These edits SHALL be serialised. Failures SHALL be reported with the daemon, instance and reason, and a partially applied operation SHALL never be reported as successful.

A pair whose new list is empty (an unbinding) SHALL be applied best effort: an unreachable daemon is skipped with a warning. Every other unreachable daemon SHALL fail the edit.

#### Scenario: Assigning an instance to a mapped user binds it first
- **WHEN** a Web Admin assigns instance X on daemon D to a user mapped to `alice`
- **THEN** the panel asks D to check and then apply `[alice]` for X, and stores the new assignment only after both succeed

#### Scenario: A failed check leaves the panel unchanged
- **WHEN** a daemon reports that `alice` cannot be resolved, resolves to uid 0, differs from another account sharing the instance, or that the instance is running
- **THEN** the edit is rejected with that reason and no user record changes

#### Scenario: Unbinding survives an offline node
- **WHEN** a mapped user is unassigned from an instance whose daemon is offline
- **THEN** the panel change is stored, a warning is logged, and the daemon converges on the next edit touching that pair

## MODIFIED Requirements

### Requirement: Administrative User Editing
The system SHALL allow only administrators to edit user records, applying only recognized fields and ignoring any other supplied keys. The recognized fields are:
- user name, profile flag, permission and timestamps;
- instances;
- password, API key, TOTP secret and 2FA flag;
- SSO subject and SSO-bound flag;
- OS account, Web Admin callers only.

Permission level 0 SHALL be assignable. API key, TOTP secret, and SSO subject values equal to the secret mask literal `__MCSM_SECRET_DATA__` SHALL be treated as "no change" and MUST NOT be written to storage. Edits that change the OS account or the instance list SHALL go through the coordinated binding flow before anything is stored.

#### Scenario: Rename is format-validated only
- **WHEN** an administrator renames a user
- **THEN** the new name is format-validated but its uniqueness against other accounts is not re-checked (current behavior)

#### Scenario: Mask placeholder never overwrites secrets
- **WHEN** an administrative edit returns the secret mask placeholder in an API key, TOTP secret, or SSO subject field
- **THEN** the stored value for that field remains unchanged

#### Scenario: Unrecognized fields are ignored
- **WHEN** an administrative edit contains arbitrary extra keys in the config object
- **THEN** only recognized fields are applied and the stored record contains no unexpected properties

#### Scenario: Guest level is assignable
- **WHEN** an administrator sets a user's permission to 0
- **THEN** the change is persisted and the user is subsequently treated as GUEST

#### Scenario: Mapping change is coordinated
- **WHEN** a Web Admin changes a user's OS account while that user holds instances
- **THEN** every held instance is checked and applied with the new account before the new value is stored

### Requirement: User Deletion and Assignment Cleanup
The system SHALL allow only administrators to delete users in bulk by uuid, removing each account's in-memory record and persisted file. Deleting an instance SHALL remove that instance from every user's assignment list, and user deletion SHALL release all of that user's instance assignments. Deleting a mapped user SHALL recompute the OS account binding of each instance the user held and apply it best effort.

#### Scenario: Bulk deletion removes stored accounts
- **WHEN** an administrator submits a list of user uuids for deletion
- **THEN** each listed account is removed from the user registry and its persisted record is deleted

#### Scenario: Instance deletion unbinds all users
- **WHEN** an instance is deleted through instance administration
- **THEN** that (daemonId, instanceUuid) pair is removed from every user's in-memory assignment list (the cleanup is not re-persisted until each user record is next edited — current behavior)

#### Scenario: Deleting a mapped user releases its bindings
- **WHEN** a user mapped to `alice` who holds instance X is deleted and no other user holding X is mapped
- **THEN** the panel asks X's daemon to clear the binding; if that daemon is offline, the deletion still completes and a warning is logged

### Requirement: Exchange Instance Purchase and Renewal
The panel SHALL let the exchange platform dispatch commercial actions (ping, buy, renew, query, SSO token) through an administrator-gated endpoint. It SHALL let an unauthenticated redeem-code endpoint purchase an instance under a per-code mutex.

Purchases SHALL attach the instance to an existing same-name account, or create one with a generated password. The redeem code SHALL be deleted only after the instance is confirmed created.

When the existing account is mapped to an OS account, the new instance SHALL be bound and reconciled before the purchase is confirmed. If binding fails, the new instance SHALL be deleted and the purchase SHALL fail.

#### Scenario: A redeem code creates an instance and account
- **WHEN** a valid redeem code is redeemed for a new user name
- **THEN** an instance is created on the target node and an account is created with a generated password and the instance assigned

#### Scenario: Username validation precedes instance creation
- **WHEN** a redeem code carries an invalid or too-short user name
- **THEN** the purchase fails before any instance is created, never leaving an orphan instance (current behavior)

#### Scenario: Redeem code is deleted only after confirmation
- **WHEN** instance creation fails after the redeem code was validated
- **THEN** the redeem code is not deleted (current behavior)

#### Scenario: Purchase for a mapped account binds before confirming
- **WHEN** an existing user mapped to `alice` buys an instance and the daemon cannot bind it
- **THEN** the new instance is deleted, the redeem code is kept, and the purchase fails with the daemon's reason
