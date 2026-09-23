import "server-only";
import { cache } from "react";
import type { UserRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type CurrentUser = {
  id: string;
  name: string | null;
  email: string;
  role: UserRole;
};

export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) {
    return null;
  }
  return prisma.user.findUnique({
    where: { id },
    select: { id: true, name: true, email: true, role: true },
  });
});
