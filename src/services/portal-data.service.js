import { apiClient } from './api';
import { mapAuditEvent, mapCategory, mapCitizen, mapComplaint, mapDepartment, mapNotification, mapOfficer, } from './api.models';
async function getData(url) {
    const response = await apiClient.get(url);
    return response.data.data;
}
async function getAllPages(url, pageSize = 100) {
    const first = await getData(`${url}?page=1&pageSize=${pageSize}`);
    const pages = Math.ceil(first.total / pageSize);
    if (pages <= 1)
        return first.items;
    const remaining = await Promise.all(Array.from({ length: pages - 1 }, (_, index) => getData(`${url}?page=${index + 2}&pageSize=${pageSize}`)));
    return first.items.concat(...remaining.map((page) => page.items));
}
export async function fetchPortalData(role) {
    const [complaintRecords, notificationPage, metadataDepartments, metadataCategories] = await Promise.all([
        getAllPages('/complaints'),
        getData('/notifications?page=1&pageSize=100'),
        getData('/metadata/departments'),
        getData('/metadata/categories'),
    ]);
    let departments = metadataDepartments.map(mapDepartment);
    let categories = metadataCategories.map(mapCategory);
    let officers = [];
    let citizens = [];
    let auditLogs = [];
    let prioritySlaHours = { Critical: 12, High: 24, Medium: 72, Low: 120 };
    let dashboardStats;
    if (role === 'admin') {
        const [adminDepartments, adminCategories, users, dashboard, auditPage, slaConfigs] = await Promise.all([
            getData('/admin/departments'),
            getData('/admin/categories'),
            Promise.all([
                getData('/admin/officers'),
                getData('/admin/citizens'),
            ]),
            getData('/admin/dashboard'),
            getAllPages('/admin/audit-logs'),
            getData('/admin/sla'),
        ]);
        departments = adminDepartments.map(mapDepartment);
        categories = adminCategories.map(mapCategory);
        officers = users[0].map(mapOfficer);
        citizens = users[1].map(mapCitizen);
        auditLogs = auditPage.map(mapAuditEvent);
        for (const config of slaConfigs) {
            if (!config.priority)
                continue;
            const priority = config.priority.toLowerCase();
            if (priority === 'critical' || priority === 'high' || priority === 'medium' || priority === 'low') {
                prioritySlaHours[priority[0].toUpperCase() + priority.slice(1)] = config.resolutionHours;
            }
        }
        dashboardStats = {
            complaints: dashboard.complaints,
            citizens: dashboard.citizens,
            officers: dashboard.officers,
            statuses: Object.fromEntries(dashboard.statuses.map((item) => [item.status, item._count._all])),
        };
    }
    return {
        complaints: complaintRecords.map(mapComplaint),
        notifications: notificationPage.items.map(mapNotification),
        departments,
        categories,
        officers,
        citizens,
        auditLogs,
        prioritySlaHours,
        dashboardStats,
    };
}
