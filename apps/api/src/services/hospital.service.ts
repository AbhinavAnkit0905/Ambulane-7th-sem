import { prisma } from '@smart-ambulance/database';
import { LatLng, calculateHaversineDistance } from '@smart-ambulance/shared';
import { routingProvider } from '../providers';

export interface RecommendedHospital {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  phone?: string | null;
  emergencyDepartmentOpen: boolean;
  icuAvailable: boolean;
  icuBeds: number;
  totalAvailableBeds: number;
  receivingCapacity: number;
  distanceMeters: number;
  etaSeconds: number;
  recommendationScore: number; // 0 - 100
  recommendationReason: string;
  isRecommended: boolean;
}

export class HospitalService {
  async getAllHospitals() {
    return prisma.hospital.findMany({
      orderBy: { name: 'asc' }
    });
  }

  async getNearbyHospitals(location: LatLng): Promise<RecommendedHospital[]> {
    const hospitals = await prisma.hospital.findMany({
      where: { status: 'ACTIVE' }
    });

    const evaluatedList: RecommendedHospital[] = [];

    for (const hosp of hospitals) {
      const distance = Math.round(calculateHaversineDistance(location, {
        latitude: hosp.latitude,
        longitude: hosp.longitude
      }));

      // Approximate speed ~45 km/h for emergency vehicle (12.5 m/s)
      const etaSeconds = Math.round(distance / 12.5);

      // Multi-factor hospital recommendation scoring:
      // Weightings: Distance/ETA (40%), ED Open (25%), ICU Availability (15%), Bed Availability (10%), Receiving Capacity (10%)
      let score = 0;
      let reasons: string[] = [];

      // Distance score (max 40 pts, full score if < 2km, decays to 0 at 25km)
      const distancePts = Math.max(0, 40 * (1 - Math.min(distance, 25000) / 25000));
      score += distancePts;

      // Emergency department status (critical prerequisite)
      if (hosp.emergencyDepartmentOpen) {
        score += 25;
      } else {
        reasons.push('Emergency Department Closed');
      }

      // ICU capacity
      if (hosp.icuAvailable && hosp.icuBeds > 0) {
        score += Math.min(15, (hosp.icuBeds / 10) * 15);
      } else {
        reasons.push('No ICU Beds Available');
      }

      // Bed availability
      score += Math.min(10, (hosp.totalAvailableBeds / 50) * 10);

      // Receiving capacity
      score += (hosp.receivingCapacity / 100) * 10;

      let recommendationReason = 'Optimal emergency transit time and bed availability';
      if (!hosp.emergencyDepartmentOpen) {
        recommendationReason = 'Not recommended: Emergency department currently closed';
      } else if (reasons.length > 0) {
        recommendationReason = `Limited capacity: ${reasons.join(', ')}`;
      } else if (distance < 3000) {
        recommendationReason = 'Closest emergency trauma center with active ICU bed availability';
      }

      evaluatedList.push({
        id: hosp.id,
        name: hosp.name,
        address: hosp.address,
        latitude: hosp.latitude,
        longitude: hosp.longitude,
        phone: hosp.phone,
        emergencyDepartmentOpen: hosp.emergencyDepartmentOpen,
        icuAvailable: hosp.icuAvailable,
        icuBeds: hosp.icuBeds,
        totalAvailableBeds: hosp.totalAvailableBeds,
        receivingCapacity: hosp.receivingCapacity,
        distanceMeters: distance,
        etaSeconds,
        recommendationScore: Math.round(score),
        recommendationReason,
        isRecommended: false
      });
    }

    // Sort descending by recommendation score
    evaluatedList.sort((a, b) => b.recommendationScore - a.recommendationScore);

    // Mark the top valid hospital as recommended
    if (evaluatedList.length > 0 && evaluatedList[0].emergencyDepartmentOpen) {
      evaluatedList[0].isRecommended = true;
    }

    return evaluatedList;
  }

  async updateCapacity(id: string, data: {
    emergencyDepartmentOpen?: boolean;
    icuAvailable?: boolean;
    icuBeds?: number;
    totalAvailableBeds?: number;
    receivingCapacity?: number;
  }) {
    return prisma.hospital.update({
      where: { id },
      data
    });
  }
}

export const hospitalService = new HospitalService();
