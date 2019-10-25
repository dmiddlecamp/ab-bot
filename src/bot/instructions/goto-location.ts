/// <reference types="node" />

import { IInstruction } from "./iinstruction";
import { SteeringInstruction } from "../steering/steering-instruction";
import { Calculations } from "../calculations";
import { BotCharacter } from "../bot-character";
import { GotoLocationConfig } from "./goto-location-config";
import { IAirmashEnvironment } from "../airmash/iairmash-environment";
import { PlayerInfo } from "../airmash/player-info";
import { Pos } from "../pos";
import logger = require("../../helper/logger");
import { StopWatch } from "../../helper/timer";
import { doPathFinding } from "../pathfinding/path-finding";

const timeoutUntilNextPathFindingStopWatch = new StopWatch();
let lastPathFindingMs: number;
let lastPath: Pos[];

export class GotoLocationInstruction implements IInstruction {

    private config: GotoLocationConfig;

    constructor(private env: IAirmashEnvironment, private character: BotCharacter, private targetPlayerId = null) {
    }

    private async getNextPos(me: PlayerInfo, deltaToTarget: { diffX: number, diffY: number, distance: number }): Promise<Pos> {

        let myPos = me.pos;
        if (this.character && this.character.predictPositions) {
            myPos = Calculations.predictPosition(this.env.getPing(), myPos, me.speed);
        }

        let targetPos: Pos;
        if (this.config.backwards) {
            // we need to flee from this target actually
            // draw a line from target trough me, and fly to that point
            targetPos = new Pos({
                x: myPos.x - deltaToTarget.diffX,
                y: myPos.y - deltaToTarget.diffY
            });
        } else {
            targetPos = this.config.targetPos;
        }

        const pathFindingConfig = {
            missiles: this.env.getMissiles(),
            myPos,
            myType: me.type,
            targetPos,
            distance: deltaToTarget.distance
        };

        try {
            const timeoutMs = Math.max(lastPathFindingMs, 200);
            const shouldCalculate = !lastPath || timeoutUntilNextPathFindingStopWatch.elapsedMs() > timeoutMs;
            if (shouldCalculate) {
                const pathFindingStopwatch = new StopWatch();
                pathFindingStopwatch.start();
                lastPath = await doPathFinding(pathFindingConfig.missiles, myPos, pathFindingConfig.myType, targetPos, pathFindingConfig.distance);
                lastPathFindingMs = pathFindingStopwatch.elapsedMs();
                timeoutUntilNextPathFindingStopWatch.start();
            }
            this.config.errors = 0;

            return lastPath[1]; // first pos is always my own pos
        } catch (error) {
            throw error;
        }
    }

    configure(config: GotoLocationConfig) {
        this.config = config;
    }

    async getSteeringInstruction(): Promise<SteeringInstruction> {
        const result = new SteeringInstruction();

        const myInfo = this.env.me();
        const delta = Calculations.getDelta(myInfo.pos, this.config.targetPos);

        const firstPosToGoTo = await this.getNextPos(myInfo, delta);

        if (!delta || delta.distance == this.config.desiredDistanceToTarget) {
            result.targetSpeed = 0;
        } else if (delta.distance < this.config.desiredDistanceToTarget) {
            // too close
            result.targetSpeed = -1;
        } else {
            result.targetSpeed = 1;

            if (myInfo.type === 1) {
                let isCarryingFlag = false;
                if (this.env.getGameType() === 2) {
                    const otherFlag = this.env.getFlagInfo(myInfo.team === 1 ? 2 : 1);
                    isCarryingFlag = otherFlag.carrierId === myInfo.id;
                }
                if (!isCarryingFlag) {
                    if (this.character && delta.distance > this.character.firingRange) {
                        result.boost = true;
                    } else if (this.config.desiredDistanceToTarget === 0) {
                        result.boost = true; // always boost to get to target 
                    }
                }
            }
        }

        let rotationTarget = firstPosToGoTo;
        if (result.targetSpeed === 0) {
            // very close, turn towards the target, not towards the first pos in the path
            rotationTarget = this.config.targetPos;
        }

        let desiredRotation = Calculations.getTargetRotation(myInfo.pos, rotationTarget);

        if (this.config.backwards) {
            result.targetSpeed = -result.targetSpeed;
            desiredRotation += Math.PI;
            if (desiredRotation > Math.PI * 2) {
                desiredRotation -= Math.PI * 2;
            }
        }

        const angleDiff = Calculations.getAngleDiff(myInfo.rot, desiredRotation);
        result.rotDelta = angleDiff;

        // if very close, but angle is steep, slow down for a while
        if (!this.config.backwards && delta.distance < 250) {
            if (angleDiff > Math.PI / 4) {
                result.targetSpeed = -1;
            } else if (angleDiff > Math.PI / 5) {
                result.targetSpeed = 0;
            }
        }

        return result;
    }

}