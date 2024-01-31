import * as cdk from "aws-cdk-lib";
import { RestApi } from "aws-cdk-lib/aws-apigateway";
import { CloudFrontWebDistribution } from "aws-cdk-lib/aws-cloudfront";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Topic } from "aws-cdk-lib/aws-sns";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { CfnWebACL } from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export class ControlStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    new NodejsFunction(this, "nodejs");

    const bucket = new Bucket(this, "bucket");

    new CloudFrontWebDistribution(this, "cloudfront", {
      originConfigs: [
        {
          s3OriginSource: {
            s3BucketSource: bucket,
          },
          behaviors: [
            {
              isDefaultBehavior: true,
            },
          ],
        },
      ],
    });

    const restApi = new RestApi(this, "restApi");

    restApi.root.addMethod(HttpMethod.GET);

    new Table(this, "table", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
    });

    new Topic(this, "SnsTopic");

    // new Vpc(this, "vpc"); // wait for the Elastic IP quota

    new Queue(this, "queue");

    new CfnWebACL(this, "WebACL", {
      defaultAction: {
        allow: {},
      },
      scope: "CLOUDFRONT",
      visibilityConfig: {
        sampledRequestsEnabled: true,
        cloudWatchMetricsEnabled: true,
        metricName: "webACL",
      },
    });
  }
}
