export enum ShapeType {
    CYLINDER = 0,
    BOX = 1,
}

export type Vec3 = {
    x: number;
    y: number;
    z: number;
}

export type Body = {
    dynamic: boolean;
    type: ShapeType;
    id: number;
    center: Vec3;
    size: Vec3;
    angle: number;
}

export type World = {
    bodies: Body[];
    allowedStepSize: number;
    nextBodyId: number;
}

export function createWorld(allowedStepSize: number): World {
    return {
        bodies: [],
        allowedStepSize,
        nextBodyId: 1
    };
}

export function createBox(world: World, center: Vec3, size: Vec3, angle: number, dynamic: boolean): Body {
    const box = {
        dynamic,
        size,
        center,
        type: ShapeType.BOX,
        angle,
        id: world.nextBodyId
    }

    world.bodies.push(box);
    return box;
}

export function createCylinder(world: World, center: Vec3, size: Vec3, angle: number, dynamic: boolean): Body {
    const cylinder = {
        dynamic,
        size,
        center,
        type: ShapeType.CYLINDER,
        angle,
        id: world.nextBodyId
    }

    world.bodies.push(cylinder);
    return cylinder;
}

export function translate(body: Body, delta: Vec3): void {
    body.center.x += delta.x;
    body.center.y += delta.y;
    body.center.z += delta.z;
}

export function resolve(world: World): void {
    const dynamics = world.bodies.filter(b => b.dynamic);

    for (const body of dynamics) {
        // resolve collision for bodies that can be moved
    }
}