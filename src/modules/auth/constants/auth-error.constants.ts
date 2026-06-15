import { AUTH_ERROR_CODES } from "../../../common/constants/error-codes.constants";


export type AuthErrorCodeLiteral =
  (typeof AUTH_ERROR_CODES)[keyof typeof AUTH_ERROR_CODES];
