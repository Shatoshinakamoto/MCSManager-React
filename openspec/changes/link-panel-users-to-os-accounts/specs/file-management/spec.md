# Spec Delta

## MODIFIED Requirements

### Requirement: File Ownership Synchronization
On Linux and macOS, every file and folder the daemon writes into an instance workspace SHALL be owned by the instance's effective identity when that identity resolves to a valid system account. This covers:
- new files and folders;
- editor saves;
- copies;
- compressed archives;
- URL downloads;
- mod installs;
- uploads;
- archive extractions.

A new folder tree, whether created with its parents or copied, SHALL be handed over with the no-follow workspace walker. Ownership changes SHALL follow neither symlinks nor special files, SHALL verify containment both lexically and by real path, and SHALL re-verify device and inode identity before applying the change.

For an instance bound to an OS account, the identity SHALL be resolved before the write, and an identity that cannot be resolved or applied SHALL fail the operation with an error. For unbound instances, an unresolvable run-as user SHALL leave ownership unchanged (current behavior). On Windows, ownership SHALL come from the inheritable workspace grant instead.

#### Scenario: Extracted files match run-as
- **WHEN** an archive is extracted for an instance with a resolvable run-as user
- **THEN** extracted entries and their intermediate directories are owned by that user

#### Scenario: Symlinked entries are not chowned
- **WHEN** extraction produces symlink entries
- **THEN** the ownership pass skips them

#### Scenario: File manager writes belong to the bound account
- **WHEN** a user of an instance bound to `alice` creates a folder `a/b/c`, saves a file in the editor, copies a folder, or downloads a file from a URL
- **THEN** every created or written entry is owned by `alice`

#### Scenario: Bound writes fail closed
- **WHEN** the account bound to an instance no longer exists and a user saves a file
- **THEN** the save is refused with an ownership error before anything is written
