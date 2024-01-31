import * as cdk from "aws-cdk-lib";
import { CompliantStack } from "../lib/compliant-stack";
import { ControlStack } from "../lib/control-stack";

const app = new cdk.App();
new ControlStack(app, "ControlStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});

new CompliantStack(app, "CompliantStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
});
