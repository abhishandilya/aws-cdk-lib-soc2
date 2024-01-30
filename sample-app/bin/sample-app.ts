import * as cdk from "aws-cdk-lib";
import { ControlStack } from "../lib/control-stack";

const app = new cdk.App();
new ControlStack(app, "ControlStack", {});
