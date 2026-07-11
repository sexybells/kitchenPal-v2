import { fireEvent, screen } from "@testing-library/react-native";
import { Text as RNText } from "react-native";
import { renderWithProviders } from "../../test-utils/renderWithProviders";
import { Button } from "../Button";
import { Input } from "../Input";
import { Card } from "../Card";
import { Fab } from "../Fab";

describe("Button", () => {
  it("renders its label and fires onPress", async () => {
    const onPress = jest.fn();
    await renderWithProviders(<Button label="Save" onPress={onPress} testID="btn" />);

    expect(screen.getByText("Save")).toBeTruthy();
    fireEvent.press(screen.getByTestId("btn"));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("exposes a button role and does not fire while loading", async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Button label="Submit" loading onPress={onPress} testID="btn" />,
    );

    const button = screen.getByTestId("btn");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityState).toMatchObject({ disabled: true, busy: true });
    fireEvent.press(button);
    expect(onPress).not.toHaveBeenCalled();
  });
});

describe("Input", () => {
  it("renders a label and reports text changes", async () => {
    const onChangeText = jest.fn();
    await renderWithProviders(
      <Input label="Email" value="" onChangeText={onChangeText} testID="email" />,
    );

    expect(screen.getByText("Email")).toBeTruthy();
    fireEvent.changeText(screen.getByTestId("email"), "a@b.com");
    expect(onChangeText).toHaveBeenCalledWith("a@b.com");
  });

  it("shows an error message when provided", async () => {
    await renderWithProviders(
      <Input label="Email" value="" onChangeText={() => {}} error="Required" />,
    );
    expect(screen.getByText("Required")).toBeTruthy();
  });
});

describe("Card", () => {
  it("renders children and is pressable when given onPress", async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Card onPress={onPress} testID="card" accessibilityLabel="Open">
        <RNText>Inside</RNText>
      </Card>,
    );

    expect(screen.getByText("Inside")).toBeTruthy();
    const card = screen.getByTestId("card");
    expect(card.props.accessibilityRole).toBe("button");
    fireEvent.press(card);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

describe("Fab", () => {
  it("has an accessible label and fires onPress", async () => {
    const onPress = jest.fn();
    await renderWithProviders(
      <Fab onPress={onPress} accessibilityLabel="Add item" testID="fab" />,
    );

    const fab = screen.getByTestId("fab");
    expect(fab.props.accessibilityRole).toBe("button");
    expect(fab.props.accessibilityLabel).toBe("Add item");
    fireEvent.press(fab);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
