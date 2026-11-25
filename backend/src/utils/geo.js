export function distanceKm(first, second) {
  const radians = (degrees) => degrees * Math.PI / 180
  const latitudeDelta = radians(second.latitude - first.latitude)
  const longitudeDelta = radians(second.longitude - first.longitude)
  const latitude1 = radians(first.latitude)
  const latitude2 = radians(second.latitude)
  const haversine = Math.min(1, Math.max(0,
    Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(longitudeDelta / 2) ** 2,
  ))
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine))
}
