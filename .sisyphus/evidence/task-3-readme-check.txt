=== task-3-readme-check.txt ===
Date: Tue Feb 24 11:27:22 AM MST 2026

--- OLD API REFERENCES (should be 0) ---
grep 'mnemonic()': 0
0
grep 'mem\.learn': 0
0
grep 'await mem': 0
0
grep 'Promise': 2
grep 'import mnemonic': 0
0

--- NEW API REFERENCES (should be >0) ---
grep 'MnemonicClient': 5
grep 'Effect.gen': 2
grep 'client.learnings': 3
grep 'client.state': 1
grep 'client.secrets': 1
grep 'client.health': 1
grep 'MNEMONIC_URL': 2
grep 'MNEMONIC_API_KEY': 2
grep 'MnemonicClient.Default': 2

--- ENDPOINT COVERAGE ---
  learn: 9
  inject: 3
  injectTrace: 1
  query: 2
  getLearnings: 1
  deleteLearnings: 1
  deleteLearning: 2
  getLearningNeighbors: 1
  getStats: 1
  getState: 1
  upsertState: 1
  patchState: 1
  addStateEvent: 1
  resolveState: 1
  setSecret: 1
  getSecret: 1
  deleteSecret: 1
  listSecrets: 1
  healthCheck: 1
  cleanup: 1

--- TYPE COVERAGE ---
  Learning: 5
  Secret: 5
  WorkingStatePayload: 1
  WorkingStateResponse: 1
  InjectResult: 1
  InjectTraceResult: 1
  QueryResult: 1
  Stats: 2
  DatabaseError: 1
  EmbeddingError: 1
  NotFoundError: 1
  Unauthorized: 1
  ValidationError: 1
  Api: 1

--- LINE COUNT ---
152 /home/chase/mnemonic/packages/mnemonic-client/README.md
