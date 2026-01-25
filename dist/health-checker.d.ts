export interface HealthCheck {
    name: string;
    status: 'pass' | 'fail';
    message: string;
}
export interface HealthStatus {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    checks: HealthCheck[];
    timestamp: string;
}
/**
 * Run all health checks and return overall status
 */
export declare function checkHealth(): Promise<HealthStatus>;
//# sourceMappingURL=health-checker.d.ts.map