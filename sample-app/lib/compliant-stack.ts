import * as cdk from "aws-cdk-lib";
import { MethodLoggingLevel, RestApi } from "aws-cdk-lib/aws-apigateway";
import {
  CloudFrontWebDistribution,
  FailoverStatusCode,
} from "aws-cdk-lib/aws-cloudfront";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { HttpMethod } from "aws-cdk-lib/aws-events";
import { Role } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Bucket, EventType } from "aws-cdk-lib/aws-s3";
import { SnsDestination } from "aws-cdk-lib/aws-s3-notifications";
import { LoggingProtocol, Topic } from "aws-cdk-lib/aws-sns";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { CfnWebACL, CfnWebACLAssociation } from "aws-cdk-lib/aws-wafv2";
import { Construct } from "constructs";

export class CompliantStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    /**
     * Compliant with CIS v1.2.0 and FSBP v1.0.0
     */
    new NodejsFunction(this, "nodejs");

    /**
     * Needs 2 remediations for NIST
     * 1. Encryption at rest (MEDIUM)
     * 2. Delivery status logging (MEDIUM)
     */
    const topic = new Topic(this, "SnsTopic", {
      masterKey: Key.fromLookup(this, "SnsKey", {
        aliasName: "alias/aws/sns",
      }),
      loggingConfigs: [
        {
          protocol: LoggingProtocol.LAMBDA,
          successFeedbackSampleRate: 100,
          failureFeedbackRole: Role.fromRoleName(
            this,
            "SNSFailureFeedback",
            "SNSFailureFeedback"
          ),
          successFeedbackRole: Role.fromRoleName(
            this,
            "SNSSuccessFeedback",
            "SNSSuccessFeedback"
          ),
        },
      ],
    });

    /**
     * Needs 3 remediations
     * 1. Event notification (MEDIUM)
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

    bucket.addEventNotification(
      EventType.OBJECT_REMOVED,
      new SnsDestination(topic)
    );

    /**
     * Needs 3 remediations
     * 1. At least one rule
     * 2. Logging
     * 3. Metrics
     */
    const cloudfrontWebACL = new CfnWebACL(this, "CloudfrontWebACL", {
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

    /**
     * Needs 6 Remediations
     * 1. TODO: Logging (MEDIUM)
     * 2. TODO: Custom SSL/TLS certificate (MEDIUM)
     * 3. TODO: Use Origin Access Control (MEDIUM)
     * 4. WAF (MEDIUM)
     * 5. Origin Failover (LOW)
     * 6. TODO: HTTPS (LOW)
     */
    new CloudFrontWebDistribution(this, "cloudfront", {
      webACLId: cloudfrontWebACL.attrArn,
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
          failoverS3OriginSource: {
            s3BucketSource: bucket,
          },
          failoverCriteriaStatusCodes: [FailoverStatusCode.FORBIDDEN],
        },
      ],
    });

    const regionalWebACL = new CfnWebACL(this, "RegionalWebACL", {
      defaultAction: {
        allow: {},
      },
      scope: "REGIONAL",
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

    /**
     * Needs 3 remediations
     * 1. Execution logging (MEDIUM)
     * 2. TODO: WAF (MEDIUM)
     * 3. X-Ray tracing (LOW)
     */
    const restApi = new RestApi(this, "restApi", {
      deployOptions: {
        tracingEnabled: true,
        loggingLevel: MethodLoggingLevel.ERROR,
      },
    });

    restApi.root.addMethod(HttpMethod.GET);

    new CfnWebACLAssociation(this, "RegionalWebACLAssociation", {
      webAclArn: regionalWebACL.attrArn,
      resourceArn: `arn:aws:apigateway:${
        cdk.Stack.of(this).region
      }::/restapis/${restApi.restApiId}/stages/${
        restApi.deploymentStage.stageName
      }`,
    });

    /**
     * Needs 2 remediations
     * 1. Point-in-time recovery (MEDIUM)
     * 2. Deletion protection (MEDIUM)
     * 4. Auto scale (MEDIUM)
     */
    const table = new Table(this, "table", {
      partitionKey: {
        name: "id",
        type: AttributeType.STRING,
      },
      pointInTimeRecovery: true,
      deletionProtection: true,
    });

    table
      .autoScaleReadCapacity({ minCapacity: 1, maxCapacity: 2 })
      .scaleOnUtilization({ targetUtilizationPercent: 50 });
    table
      .autoScaleWriteCapacity({ minCapacity: 1, maxCapacity: 2 })
      .scaleOnUtilization({ targetUtilizationPercent: 50 });

    // new Vpc(this, "vpc"); // wait for Elastic IP quota increase

    /**
     * Compliant by default
     */
    new Queue(this, "queue");
  }
}
