import { prisma } from '@smart-ambulance/database';
import {
  LatLng,
  AlertStatus,
  AlertPriorityLevel,
  SOCKET_EVENTS,
  evaluateCorridorProximity,
  EmergencyAlertPayload
} from '@smart-ambulance/shared';
import { getSocketServer } from '../socket';
import { notificationProvider } from '../providers';
import { logger } from '../logger';
import { config } from '../config';

export class PassageNetworkService {
  /**
   * Evaluates all nearby registered drivers and dispatches / updates emergency passage alerts.
   */
  async processAmbulanceMovement(
    ambulanceId: string,
    emergencyId: string,
    currentLocation: LatLng,
    ambulanceSpeedKmh: number = 45
  ): Promise<{ alertedDriversCount: number }> {
    // 1. Fetch active emergency with its active route polyline and ambulance details
    const emergency = await prisma.emergency.findUnique({
      where: { id: emergencyId },
      include: {
        ambulance: true,
        routes: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });

    if (!emergency || !emergency.ambulance || emergency.routes.length === 0) {
      return { alertedDriversCount: 0 };
    }

    const latestRoute = emergency.routes[0];
    let routePolyline: [number, number][] = [];
    try {
      routePolyline = JSON.parse(latestRoute.polylineJson);
    } catch {
      routePolyline = [];
    }

    // 2. Fetch all normal users with recorded locations
    // Exclude the ambulance driver and admin
    const userLocations = await prisma.userLocation.findMany({
      where: {
        user: {
          role: 'NORMAL_USER'
        }
      },
      include: {
        user: { select: { id: true, name: true } }
      }
    });

    const io = getSocketServer();
    let currentAlertedCount = 0;

    for (const record of userLocations) {
      const userLoc: LatLng = {
        latitude: record.latitude,
        longitude: record.longitude
      };

      // 3. Evaluate Condition A (2000m geofence) AND Condition B (100-200m ahead corridor)
      const evaluation = evaluateCorridorProximity(
        userLoc,
        currentLocation,
        routePolyline,
        ambulanceSpeedKmh,
        {
          geofenceRadiusMeters: config.geofenceRadiusMeters,
          corridorBufferMeters: config.corridorBufferMeters,
          lookAheadMeters: config.lookAheadMeters
        }
      );

      // 4. Query existing alert for this (emergencyId, userId)
      const existingAlert = await prisma.emergencyAlert.findUnique({
        where: {
          emergencyId_userId: {
            emergencyId,
            userId: record.userId
          }
        }
      });

      if (evaluation.isEligibleForAlert) {
        currentAlertedCount++;
        const safeInstruction =
          'Please give way and allow the ambulance to pass when safe and legal to do so.';

        if (!existingAlert || existingAlert.status !== AlertStatus.ACTIVE) {
          // CREATE NEW ALERT (Requirement 39 & 40)
          const newAlert = await prisma.emergencyAlert.upsert({
            where: {
              emergencyId_userId: {
                emergencyId,
                userId: record.userId
              }
            },
            create: {
              emergencyId,
              userId: record.userId,
              status: AlertStatus.ACTIVE,
              priorityLevel: evaluation.priorityLevel,
              lastDistance: evaluation.distanceToAmbulance,
              lastEtaSeconds: evaluation.estimatedEtaSeconds,
              safeInstruction,
              sentAt: new Date(),
              lastUpdatedAt: new Date()
            },
            update: {
              status: AlertStatus.ACTIVE,
              priorityLevel: evaluation.priorityLevel,
              lastDistance: evaluation.distanceToAmbulance,
              lastEtaSeconds: evaluation.estimatedEtaSeconds,
              lastUpdatedAt: new Date(),
              expiredAt: null
            }
          });

          const payload: EmergencyAlertPayload = {
            alertId: newAlert.id,
            emergencyId,
            emergencyNumber: emergency.emergencyNumber,
            ambulanceId: emergency.ambulance.id,
            ambulanceRegistration: emergency.ambulance.registrationNumber,
            distanceMeters: Math.round(evaluation.distanceToAmbulance),
            etaSeconds: evaluation.estimatedEtaSeconds,
            priorityLevel: evaluation.priorityLevel,
            status: AlertStatus.ACTIVE,
            ambulanceLocation: currentLocation,
            safeInstruction,
            updatedAt: new Date().toISOString()
          };

          // Emit initial alert with sound trigger to targeted user room
          if (io) {
            io.to(`user:${record.userId}`).emit(SOCKET_EVENTS.EMERGENCY_ALERT, payload);
          }

          // Optional mobile push notification
          notificationProvider.sendPushNotification(
            record.userId,
            '🚨 Emergency Ambulance Approaching',
            `Ambulance ${emergency.ambulance.registrationNumber} approaching in ~${Math.round(evaluation.estimatedEtaSeconds / 60)} min. Please give way when safe.`,
            { emergencyId }
          );

          logger.info('Dispatched targeted emergency passage alert', {
            userId: record.userId,
            distance: evaluation.distanceToAmbulance,
            priority: evaluation.priorityLevel
          });
        } else {
          // UPDATE EXISTING ALERT (Deduplication - Requirement 39 & 76)
          // Update distance and ETA without playing a new alert sound
          await prisma.emergencyAlert.update({
            where: { id: existingAlert.id },
            data: {
              lastDistance: evaluation.distanceToAmbulance,
              lastEtaSeconds: evaluation.estimatedEtaSeconds,
              priorityLevel: evaluation.priorityLevel,
              lastUpdatedAt: new Date()
            }
          });

          if (io) {
            const updatePayload: EmergencyAlertPayload = {
              alertId: existingAlert.id,
              emergencyId,
              emergencyNumber: emergency.emergencyNumber,
              ambulanceId: emergency.ambulance.id,
              ambulanceRegistration: emergency.ambulance.registrationNumber,
              distanceMeters: Math.round(evaluation.distanceToAmbulance),
              etaSeconds: evaluation.estimatedEtaSeconds,
              priorityLevel: evaluation.priorityLevel,
              status: AlertStatus.ACTIVE,
              ambulanceLocation: currentLocation,
              safeInstruction,
              updatedAt: new Date().toISOString()
            };

            io.to(`user:${record.userId}`).emit(SOCKET_EVENTS.EMERGENCY_ALERT_UPDATE, updatePayload);
          }
        }
      } else {
        // User is not eligible. If they previously had an ACTIVE alert, expire it! (Requirement 40 & 41)
        if (existingAlert && existingAlert.status === AlertStatus.ACTIVE) {
          await prisma.emergencyAlert.update({
            where: { id: existingAlert.id },
            data: {
              status: AlertStatus.PASSED,
              expiredAt: new Date()
            }
          });

          if (io) {
            io.to(`user:${record.userId}`).emit(SOCKET_EVENTS.EMERGENCY_ALERT_EXPIRED, {
              alertId: existingAlert.id,
              emergencyId,
              reason: 'Ambulance has safely passed your area'
            });
          }

          logger.info('Expired emergency alert for user (passed/outside corridor)', {
            userId: record.userId,
            emergencyId
          });
        }
      }
    }

    // 5. Notify admin room with latest alerted users count
    if (io) {
      io.to(SOCKET_EVENTS.ROOM_ADMIN).emit('admin:alert_count_update', {
        emergencyId,
        alertedCount: currentAlertedCount
      });
    }

    return { alertedDriversCount: currentAlertedCount };
  }

  /**
   * Terminates all alerts when an emergency completes or is cancelled (Requirement 77).
   */
  async expireAllAlertsForEmergency(emergencyId: string): Promise<void> {
    const activeAlerts = await prisma.emergencyAlert.findMany({
      where: {
        emergencyId,
        status: AlertStatus.ACTIVE
      }
    });

    await prisma.emergencyAlert.updateMany({
      where: { emergencyId },
      data: {
        status: AlertStatus.EXPIRED,
        expiredAt: new Date()
      }
    });

    const io = getSocketServer();
    if (io) {
      for (const alert of activeAlerts) {
        io.to(`user:${alert.userId}`).emit(SOCKET_EVENTS.EMERGENCY_ALERT_EXPIRED, {
          alertId: alert.id,
          emergencyId,
          reason: 'Emergency response concluded'
        });
      }
    }

    logger.info('Expired all passage alerts for completed emergency', {
      emergencyId,
      count: activeAlerts.length
    });
  }
}

export const passageNetworkService = new PassageNetworkService();
