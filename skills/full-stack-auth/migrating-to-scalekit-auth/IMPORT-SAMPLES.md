# Import Code Samples

## Python — Create organization
```python
from scalekit.v1.organizations.organizations_pb2 import CreateOrganization

result = scalekit_client.organization.create_organization(
  CreateOrganization(
    display_name="Megasoft Inc",
    external_id="org_123",
    metadata={"plan": "enterprise"}
  )
)
```

## Python — Create user in organization
```python
from scalekit.v1.users.users_pb2 import CreateUser
from scalekit.v1.commons.commons_pb2 import UserProfile

user_msg = CreateUser(
  email="user@example.com",
  external_id="usr_987",
  metadata={"department": "engineering"},
  user_profile=UserProfile(first_name="John", last_name="Doe")
)
create_resp, _ = scalekit_client.user.create_user_and_membership("org_123", user_msg)
```

## Go — Create organization
```go
result, err := scalekit.Organization.CreateOrganization(ctx, "Megasoft Inc",
  scalekit.CreateOrganizationOptions{ExternalID: "org_123"})
```

## Go — Create user in organization
```go
createUser := &usersv1.CreateUser{
  Email:      "user@example.com",
  ExternalId: "usr_987",
  UserProfile: &usersv1.CreateUserProfile{
    FirstName: "John",
    LastName:  "Doe",
  },
}
resp, err := scalekitClient.User().CreateUserAndMembership(ctx, "org_123", createUser)
```

## Java — Create organization
```java
CreateOrganization createOrg = CreateOrganization.newBuilder()
  .setDisplayName("Megasoft Inc")
  .setExternalId("org_123")
  .build();
scalekitClient.organizations().createOrganization(createOrg);
```

## Java — Create user
```java
CreateUser createUser = CreateUser.newBuilder()
  .setEmail("user@example.com")
  .setExternalId("usr_987")
  .setUserProfile(CreateUserProfile.newBuilder().setFirstName("John").setLastName("Doe").build())
  .build();
scalekitClient.users().createUserAndMembership("org_123", createUser);
```

## cURL — Create organization
```sh
curl -L -X POST '<SCALEKIT_ENVIRONMENT_URL>/api/v1/organizations' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{
    "display_name": "Megasoft Inc",
    "external_id": "org_123",
    "metadata": { "plan": "enterprise" }
  }'
```

## cURL — Create user in organization
```sh
curl -L -X POST '<SCALEKIT_ENVIRONMENT_URL>/api/v1/organizations/<ORG_ID>/users' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <TOKEN>' \
  -d '{
    "email": "user@example.com",
    "external_id": "usr_987",
    "send_invitation_email": false,
    "user_profile": { "first_name": "John", "last_name": "Doe" }
  }'
```
