# Tasks Service Refactor Spec Information

## Goal

Refactor `TasksService` so it focuses on core CRUD orchestration and delegates validation, workspace-type normalization, and persistence data transformation to focused services.

## What Changed

### 1. Added `TaskCreationValidationService`

File: `src/modules/tasks/services/task-creation-validation.service.ts`

Responsibilities:

- Validate `workspaceId` and object id format.
- Validate current user workspace membership.
- Validate assignee existence and workspace membership.
- Validate Kanban board ownership.
- Validate Scrum sprint ownership.
- Resolve workspace by key for key-based board routes.

### 2. Added `TaskNormalizerService`

File: `src/modules/tasks/services/task-normalizer.service.ts`

Responsibilities:

- Normalize task create payload based on workspace type.
- For Kanban workspaces:
  - Reject `sprintId`.
  - Resolve board from `boardId` or default workspace board.
  - Resolve requested `columnId` or `status`.
  - Treat `status` as task business state.
  - Treat `columnId` as board display position.
  - Default to the first board column when no column is provided.
- For Scrum workspaces:
  - Reject `boardId`.
  - Validate optional `sprintId`.
  - Default task status to `todo`.

### 3. Added `TaskDataTransformerService`

File: `src/modules/tasks/services/task-data-transformer.service.ts`

Responsibilities:

- Convert create DTO into persistence payload.
- Convert update DTO into persistence payload.
- Centralize `Types.ObjectId` creation.
- Persist `status` and `columnId` as separate fields.
- Convert `dueDate` string into `Date`.

### Task Status And Column Architecture

- `status` is the task business state and is persisted on the task.
- `columnId` is the board presentation position and is persisted separately.
- `boardColumnId` was removed from task request/response contracts.
- Creating from the global create modal should send `status`.
- Creating from a board column should send `columnId`.
- For Kanban tasks, the normalizer maps:
  - `status -> columnId` when the user creates from the global modal.
  - `columnId -> status` when the user creates directly inside a column.

### 4. Refactored `TasksService`

File: `src/modules/tasks/services/tasks.service.ts`

Current responsibility:

- CRUD orchestration only.
- Delegate create validation to `TaskCreationValidationService`.
- Delegate workspace-type normalization to `TaskNormalizerService`.
- Delegate data conversion to `TaskDataTransformerService`.
- Keep task key generation delegated to `TaskKeyService`.
- Keep persistence delegated to `TasksRepository`.
- Keep response mapping delegated to `TaskMapper`.

## Public Flow After Refactor

### Create Task

1. Get required `workspaceId`.
2. Validate workspace and membership.
3. Normalize DTO for Kanban or Scrum workspace.
4. Generate task key from workspace key.
5. Transform DTO into repository payload.
6. Save task.
7. Map task document to response DTO.

### Update Task

1. Validate task id.
2. Load existing task.
3. Validate update references against task workspace.
4. Transform update DTO into repository payload.
5. Save update.
6. Map task document to response DTO.

## Module Wiring

`TasksModule` now provides:

- `TasksService`
- `TasksRepository`
- `TaskMapper`
- `TaskKeyService`
- `TaskCreationValidationService`
- `TaskNormalizerService`
- `TaskDataTransformerService`

## Verification

Commands run:

```bash
npm.cmd run build
npm.cmd test -- --runInBand modules/tasks/services/tasks.service.spec.ts modules/tasks/services/task-key.service.spec.ts
```

Result:

- Build passed.
- Task service tests passed.
- Task key service tests passed.
