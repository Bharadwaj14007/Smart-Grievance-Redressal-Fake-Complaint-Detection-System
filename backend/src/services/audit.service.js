import { prisma } from '../config/prisma.js';
export async function writeAudit(req, action, entityType, entityId, metadata) {
    return prisma.auditLog.create({
        data: {
            actorId: req.user?.id,
            action,
            entityType,
            entityId,
            metadata,
            ipAddress: req.ip,
        },
    });
}
