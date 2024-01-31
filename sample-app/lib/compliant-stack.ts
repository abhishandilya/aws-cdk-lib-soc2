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

export class CompliantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Compliant with CIS v1.2.0 and FSBP v1.0.0
     */
    new NodejsFunction(this, "nodejs");

    /**
     * Needs 3 remediations
     * 1. TODO: Event notification (MEDIUM)
     * 2. Server Access Logging (MEDIUM)
     * 3. SSL enforced (MEDIUM)
     * 4. LifeCycle Policy (LOW)
     */
    const bucket = new Bucket(this, "bucket", {
      enforceSSL: true,
      serverAccessLogsPrefix: "logs/",
      lifecycleRules: [
        {
          expiredObjectDeleteMarker: true,
        },
      ],
    });

    /**
     * Needs 6 Remediations
     * 1. TODO: Logging
     * 2. TODO: Custom SSL/TLS certificate
     * 3. TODO: Use Origin Access Control
     * 4. TODO: WAF
     * 5. TODO: Origin Failover (LOW)
     * 6. TODO: HTTPS (LOW)
     *
     */
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

    /**
     * Needs 3 remediations
     * 1. TODO: Execution logging (MEDIUM)
     * 2. TODO: WAF (MEDIUM)
     * 3. TODO: X-Ray tracing (LOW)
     */
    const restApi = new RestApi(this, "restApi");

    restApi.root.addMethod(HttpMethod.GET);

    /**
     * Needs 2 remediations
     * 1. Point-in-time recovery (MEDIUM)
     * 2. Deletion protection (MEDIUM)
     */
    new Table(this, "table", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      deletionProtection: true,
    });

    /**
     * Needs 2 remediations
     * 1. TODO: Encryption (MEDIUM)
     * 2. TODO: Delivery status logging (MEDIUM)
     */
    new Topic(this, "SnsTopic");

    // new Vpc(this, "vpc"); // wait for Elastic IP quota increase

    /**
     * Needs 1 remediation
     * 1. TODO: Encryption (MEDIUM)
     */
    new Queue(this, "queue");

    /**
     * Needs 3 remediations
     * 1. At least one rule
     * 2. Logging
     * 3. Metrics
     */
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
      rules: [
        {
          name: "AWS-AWSManagedRulesAmazonIpReputationList",
          priority: 0,
          statement: {
            managedRuleGroupStatement: {
              name: "AWSManagedRulesAmazonIpReputationList",
              vendorName: "AWS",
            },
          },
          overrideAction: {
            none: {},
          },
          visibilityConfig: {
            cloudWatchMetricsEnabled: true,
            sampledRequestsEnabled: true,
            metricName: "AWS-AWSManagedRulesAmazonIpReputationList",
          },
        },
      ],
    });
  }
}
