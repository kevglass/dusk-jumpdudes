export enum ShapeType {
  CYLINDER = 0,
  BOX = 1,
}

export type Vec3 = {
  x: number
  y: number
  z: number
}

export type Vec2 = {
  x: number
  z: number
}

export type Body = {
  dynamic: boolean
  sensor: boolean
  type: ShapeType
  id: number
  center: Vec3
  size: Vec3
  angle: number
  bounds: number
  vertices: Vec2[]
  faceNormals: Vec2[]
  vy: number
}

export type World = {
  bodies: Body[]
  allowedStepSize: number
  nextBodyId: number
}

export type CollisionListener = {
  collision(dynamic: Body, fixed: Body, delta: Vec3): void
}

type CollisionDetails = {
  depth: number
  normal: Vec2
  start: Vec2
  end: Vec2
}

export function createWorld(allowedStepSize: number): World {
  return {
    bodies: [],
    allowedStepSize,
    nextBodyId: 1,
  }
}

export function createBox(
  world: World,
  center: Vec3,
  size: Vec3,
  angle: number,
  dynamic: boolean,
  sensor: boolean
): Body {
  const verts = [
    // Vertex: 0: TopLeft, 1: TopRight, 2: BottomRight, 3: BottomLeft (rectangles)
    { x: center.x - size.x / 2, z: center.z - size.z / 2 },
    { x: center.x + size.x / 2, z: center.z - size.z / 2 },
    { x: center.x + size.x / 2, z: center.z + size.z / 2 },
    { x: center.x - size.x / 2, z: center.z + size.z / 2 },
  ]

  for (let i = 4; i--; ) {
    verts[i] = rotateVec2(verts[i], center, angle)
  }

  const box = {
    dynamic,
    size,
    center,
    type: ShapeType.BOX,
    angle,
    bounds: Math.hypot(size.x, size.z) / 2,
    vertices: verts,
    faceNormals: computeRectNormals(verts),
    id: world.nextBodyId++,
    vy: 0,
    sensor,
  }

  world.bodies.push(box)
  return box
}

export function updateBox(box: Body): void {
  const center = box.center
  const size = box.size
  const angle = box.angle

  const verts = [
    // Vertex: 0: TopLeft, 1: TopRight, 2: BottomRight, 3: BottomLeft (rectangles)
    { x: center.x - size.x / 2, z: center.z - size.z / 2 },
    { x: center.x + size.x / 2, z: center.z - size.z / 2 },
    { x: center.x + size.x / 2, z: center.z + size.z / 2 },
    { x: center.x - size.x / 2, z: center.z + size.z / 2 },
  ]

  for (let i = 4; i--; ) {
    verts[i] = rotateVec2(verts[i], center, angle)
  }

  box.vertices = verts
  box.faceNormals = computeRectNormals(verts)
}

export function createCylinder(
  world: World,
  center: Vec3,
  size: Vec3,
  angle: number,
  dynamic: boolean,
  sensor: boolean
): Body {
  const cylinder = {
    dynamic,
    size,
    bounds: size.x / 2,
    center,
    type: ShapeType.CYLINDER,
    angle,
    faceNormals: [],
    vertices: [],
    id: world.nextBodyId++,
    vy: 0,
    sensor,
  }

  world.bodies.push(cylinder)
  return cylinder
}

export function translate(body: Body, delta: Vec3): void {
  body.center.x += delta.x
  body.center.y += delta.y
  body.center.z += delta.z
}

export function resolve(world: World, listener: CollisionListener): void {
  const dynamics = world.bodies.filter((b) => b.dynamic)

  for (const body of dynamics) {
    // resolve collision for bodies that can be moved
    for (const other of world.bodies) {
      if (other === body || other.dynamic) {
        continue
      }
      if (boundTest(body, other)) {
        let collisionInfo: CollisionDetails = emptyCollision()

        if (testCollision(world, body, other, collisionInfo)) {
          const yPen =
            (body.size.y + other.size.y) / 2 -
            Math.abs(body.center.y - other.center.y)
          if (yPen > 0) {
            let steppedUp = false
            if (body.sensor || other.sensor) {
              listener.collision(body, other, { x: 0, y: 0, z: 0 })
              continue
            }

            // step up to move out of collision
            if (yPen < world.allowedStepSize) {
              // then y step
              if (body.center.y > other.center.y && body.vy > 0) {
                body.center.y += yPen
                listener.collision(body, other, { x: 0, y: yPen, z: 0 })
                steppedUp = true
              }
              // else if (body.center.y < other.center.y && body.vy < 0) {
              //     body.center.y -= yPen;
              //     listener.collision(body, other, { x: 0, y: -yPen, z: 0 })
              //     steppedUp = true;
              // }
            }

            if (!steppedUp && Math.abs(yPen) > 0.0001) {
              // Make sure the normal is always from object[i] to object[j]
              if (
                dotProduct(
                  collisionInfo.normal,
                  subVec2(other.center, body.center)
                ) < 0
              ) {
                collisionInfo = {
                  depth: collisionInfo.depth,
                  normal: scaleVec2(collisionInfo.normal, -1),
                  start: collisionInfo.end,
                  end: collisionInfo.start,
                }
              }

              const dx = -collisionInfo.normal.x * collisionInfo.depth
              const dz = -collisionInfo.normal.z * collisionInfo.depth
              body.center.x += dx
              body.center.z += dz
              listener.collision(body, other, { x: dx, y: 0, z: dz })
            }
          }
        }
      }
    }
  }
}

function boundTest(s1: Body, s2: Body) {
  const coincideX = Math.abs(s1.center.x - s2.center.x) < s1.bounds + s2.bounds
  const coincideY = Math.abs(s1.center.y - s2.center.y) < s1.size.y + s2.size.y
  const coincideZ = Math.abs(s1.center.z - s2.center.z) < s1.bounds + s2.bounds

  const result = coincideX && coincideY && coincideZ

  return result
}

export function addVec2(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x + b.x,
    z: a.z + b.z,
  }
}

export function scaleVec3(a: Vec3, n: number): Vec3 {
  return {
    x: a.x * n,
    y: a.y * n,
    z: a.z * n,
  }
}

export function scaleVec2(a: Vec2, n: number): Vec2 {
  return {
    x: a.x * n,
    z: a.z * n,
  }
}

export function lengthVec2(v: Vec2): number {
  return dotProduct(v, v) ** 0.5
}

export function dotProduct(v: Vec2, w: Vec2): number {
  return v.x * w.x + v.z * w.z
}

export function subVec2(a: Vec2, b: Vec2): Vec2 {
  return {
    x: a.x - b.x,
    z: a.z - b.z,
  }
}

export function addVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x + b.x,
    y: a.y + b.y,
    z: a.z + b.z,
  }
}

export function subVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.x - b.x,
    y: a.y - b.y,
    z: a.z - b.z,
  }
}

export function averageVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
  }
}

export function rotateVec2(v: Vec2, center: Vec2, angle: number): Vec2 {
  const x = v.x - center.x
  const z = v.z - center.z

  return {
    x: x * Math.cos(angle) - z * Math.sin(angle) + center.x,
    z: x * Math.sin(angle) + z * Math.cos(angle) + center.z,
  }
}

export function normalize(v: Vec2): Vec2 {
  return scaleVec2(v, 1 / (lengthVec2(v) || 1))
}

function testCollision(
  world: World,
  c1: Body,
  c2: Body,
  collisionInfo: CollisionDetails
): boolean {
  // Circle vs circle
  if (c1.type == ShapeType.CYLINDER && c2.type === ShapeType.CYLINDER) {
    const vFrom1to2 = subVec2(c2.center, { x: c1.center.x, z: c1.center.z }),
      rSum = c1.bounds + c2.bounds,
      dist = lengthVec2(vFrom1to2)

    if (dist <= Math.sqrt(rSum * rSum)) {
      const normalFrom2to1 = normalize(scaleVec2(vFrom1to2, -1)),
        radiusC2 = scaleVec2(normalFrom2to1, c2.bounds)
      setCollisionInfo(
        collisionInfo,
        rSum - dist,
        normalize(vFrom1to2),
        addVec2(c2.center, radiusC2)
      )

      return true
    }

    return false
  }

  // Rect vs Rect
  if (c1.type == ShapeType.BOX && c2.type == ShapeType.BOX) {
    let status1 = false,
      status2 = false

    // find Axis of Separation for both rectangles
    const collisionInfoR1 = emptyCollision()
    status1 = findAxisLeastPenetration(c1, c2, collisionInfoR1)
    if (status1) {
      const collisionInfoR2 = emptyCollision()
      status2 = findAxisLeastPenetration(c2, c1, collisionInfoR2)
      if (status2) {
        // if both of rectangles are overlapping, choose the shorter normal as the normal
        if (collisionInfoR1.depth < collisionInfoR2.depth) {
          setCollisionInfo(
            collisionInfo,
            collisionInfoR1.depth,
            collisionInfoR1.normal,
            subVec2(
              collisionInfoR1.start,
              scaleVec2(collisionInfoR1.normal, collisionInfoR1.depth)
            )
          )
          return true
        } else {
          setCollisionInfo(
            collisionInfo,
            collisionInfoR2.depth,
            scaleVec2(collisionInfoR2.normal, -1),
            collisionInfoR2.start
          )
          return true
        }
      }
    }

    return false
  }

  // Rectangle vs Circle
  // (c1 is the rectangle and c2 is the circle, invert the two if needed)
  if (c1.type === ShapeType.CYLINDER && c2.type === ShapeType.BOX) {
    ;[c1, c2] = [c2, c1]
  }

  if (c1.type === ShapeType.BOX && c2.type === ShapeType.CYLINDER) {
    let inside = 1,
      bestDistance = -1e9,
      nearestEdge = 0,
      i,
      v,
      circ2Pos: Vec2 | undefined,
      projection
    for (i = 4; i--; ) {
      // find the nearest face for center of circle
      circ2Pos = c2.center
      v = subVec2(circ2Pos, c1.vertices[i])
      projection = dotProduct(v, c1.faceNormals[i])
      if (projection > 0) {
        // if the center of circle is outside of c1angle
        bestDistance = projection
        nearestEdge = i
        inside = 0
        break
      }

      if (projection > bestDistance) {
        bestDistance = projection
        nearestEdge = i
      }
    }
    let dis, normal

    if (inside && circ2Pos) {
      if (c1.id === 10) {
        console.log(c1.id, c1, c2)
      }
      // the center of circle is inside of c1angle
      setCollisionInfo(
        collisionInfo,
        c2.bounds - bestDistance,
        c1.faceNormals[nearestEdge],
        subVec2(circ2Pos, scaleVec2(c1.faceNormals[nearestEdge], c2.bounds))
      )
      return true
    } else if (circ2Pos) {
      // the center of circle is outside of c1angle
      // v1 is from left vertex of face to center of circle
      // v2 is from left vertex of face to right vertex of face
      let v1 = subVec2(circ2Pos, c1.vertices[nearestEdge]),
        v2 = subVec2(
          c1.vertices[(nearestEdge + 1) % 4],
          c1.vertices[nearestEdge]
        ),
        dotp = dotProduct(v1, v2)
      if (dotp < 0) {
        // the center of circle is in corner region of X[nearestEdge]
        dis = lengthVec2(v1)

        // compare the distance with radium to decide collision
        if (dis > c2.bounds) {
          return false
        }
        normal = normalize(v1)
        setCollisionInfo(
          collisionInfo,
          c2.bounds - dis,
          normal,
          addVec2(circ2Pos, scaleVec2(normal, -c2.bounds))
        )
        return true
      } else {
        // the center of circle is in corner region of X[nearestEdge+1]
        // v1 is from right vertex of face to center of circle
        // v2 is from right vertex of face to left vertex of face
        v1 = subVec2(circ2Pos, c1.vertices[(nearestEdge + 1) % 4])
        v2 = scaleVec2(v2, -1)
        dotp = dotProduct(v1, v2)
        if (dotp < 0) {
          dis = lengthVec2(v1)

          // compare the distance with radium to decide collision
          if (dis > c2.bounds) {
            return false
          }
          normal = normalize(v1)
          setCollisionInfo(
            collisionInfo,
            c2.bounds - dis,
            normal,
            addVec2(circ2Pos, scaleVec2(normal, -c2.bounds))
          )
          return true
        } else {
          // the center of circle is in face region of face[nearestEdge]
          if (bestDistance < c2.bounds) {
            setCollisionInfo(
              collisionInfo,
              c2.bounds - bestDistance,
              c1.faceNormals[nearestEdge],
              subVec2(
                circ2Pos,
                scaleVec2(c1.faceNormals[nearestEdge], c2.bounds)
              )
            )
            return true
          } else {
            return false
          }
        }
      }
    }
    return false
  }

  return false
}

function setCollisionInfo(
  collision: CollisionDetails,
  D: number,
  N: Vec2,
  S: Vec2
) {
  collision.depth = D // depth
  collision.normal.x = N.x // normal
  collision.normal.z = N.z // normal
  collision.start.x = S.x // start
  collision.start.z = S.z // start
  collision.end = addVec2(S, scaleVec2(N, D)) // end
}

function emptyCollision(): CollisionDetails {
  return {
    depth: 0,
    normal: { x: 0, z: 0 },
    start: { x: 0, z: 0 },
    end: { x: 0, z: 0 },
  }
}

function findAxisLeastPenetration(
  rect: Body,
  otherRect: Body,
  collisionInfo: CollisionDetails
) {
  let n,
    i,
    j,
    supportPoint,
    bestDistance = 1e9,
    bestIndex = -1,
    hasSupport = true,
    tmpSupportPoint,
    tmpSupportPointDist

  for (i = 4; hasSupport && i--; ) {
    // Retrieve a face normal from A
    n = rect.faceNormals[i]

    // use -n as direction and the vertex on edge i as point on edge
    const dir = scaleVec2(n, -1),
      ptOnEdge = rect.vertices[i]
    let // find the support on B
      vToEdge,
      projection
    tmpSupportPointDist = -1e9
    tmpSupportPoint = -1

    // check each vector of other object
    for (j = 4; j--; ) {
      vToEdge = subVec2(otherRect.vertices[j], ptOnEdge)
      projection = dotProduct(vToEdge, dir)

      // find the longest distance with certain edge
      // dir is -n direction, so the distance should be positive
      if (projection > 0 && projection > tmpSupportPointDist) {
        tmpSupportPoint = otherRect.vertices[j]
        tmpSupportPointDist = projection
      }
    }
    hasSupport = tmpSupportPoint !== -1

    // get the shortest support point depth
    if (hasSupport && tmpSupportPointDist < bestDistance) {
      bestDistance = tmpSupportPointDist
      bestIndex = i
      supportPoint = tmpSupportPoint
    }
  }
  if (hasSupport) {
    // all four directions have support point
    setCollisionInfo(
      collisionInfo,
      bestDistance,
      rect.faceNormals[bestIndex],
      addVec2(
        supportPoint as Vec2,
        scaleVec2(rect.faceNormals[bestIndex], bestDistance)
      )
    )
  }

  return hasSupport
}

function computeRectNormals(vertices: Vec2[]): Vec2[] {
  const faceNormals = []

  // N: normal of each face toward outside of rectangle
  // 0: Top, 1: Right, 2: Bottom, 3: Left
  for (let i = 4; i--; ) {
    faceNormals[i] = normalize(
      subVec2(vertices[(i + 1) % 4], vertices[(i + 2) % 4])
    )
  }

  return faceNormals
}
