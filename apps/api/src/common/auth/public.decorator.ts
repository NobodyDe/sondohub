import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'isPublic';

/** Libera a rota do SessionGuard global. Use só onde ainda não há usuário logado. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
