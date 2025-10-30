import { drizzle } from "drizzle-orm/node-postgres";
import * as authSchema from "./schema/auth";
import * as todosSchema from "./schema/todos";

const schema = { ...authSchema, ...todosSchema };

export const db = drizzle(process.env.DATABASE_URL || "", { schema });
