import type { SafeUser } from '../../modules/users/users.repository.js';

export type AuthContext = { sessionId: string; user: SafeUser };
